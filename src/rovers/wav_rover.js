/* JRE 1.8 Required */
// sudo add-apt-repository -y ppa:webupd8team/java
// sudo apt-get update
// sudo apt-get -y install oracle-java8-installer
//
// java version "1.8.0_74"
// Java(TM) SE Runtime Environment (build 1.8.0_74-b02)
// Java HotSpot(TM) 64-Bit Server VM (build 25.74-b02, mixed mode)

/* Waves DEB */
// https://github.com/wavesplatform/Waves/releases
// wget https://github.com/wavesplatform/Waves/releases/download/v0.7.8/waves_0.7.8_all.deb
// sudo dpkg -i waves*.deb
// sudo service waves start
//
//

// curl 104.207.150.166:6869/blocks/last
//
//

const _ = require('lodash')
const buffer = require('buffer')
const async = require('async')
const request = require('request')
const crypto = require('crypto')
const big = require('big.js')
const string = require('../utils/strings.js')
const Log = require('../log.js')
const https = require('https')
const fs = require('fs')

fs.writeFileSync(
  '.wavescache',
  JSON.stringify({
    LAST_HEIGHT: 0
  })
)

const LRU = require('lru-cache'),
  options = {
    max: 500,
    length: function (n, key) {
      return n * 2 + key.length
    },
    dispose: function (key, n) {
      n.close()
    },
    maxAge: 1000 * 60 * 60
  },
  blockCache = LRU(options),
  otherCache = LRU(50) // sets just the max size

const ID = 'wav'
const WAVES_NODE_HOST = 'https://nodes.wavesplatform.com' // normally this would be 0.0.0.0 or 127.0.0.1
const WAVES_NODE_PORT = 443
const DEFAULT_TYPE = 'log'

const log = new Log()

process.on('uncaughtError', function (e) {
  console.trace(e)
  console.trace('critical error ' + ID + ' rover, exiting...')
  process.exit(3)
})

process.on('disconnect', function () {
  console.log('parent exited')
  process.exit()
})

function send (type, data) {
  var d
  var t

  if (data == undefined) {
    t = DEFAULT_TYPE
    d = type
  } else {
    t = type
    d = data
  }

  var meta = {
    id: ID,
    type: t,
    data: d
  }

  process.send(meta)
}

function getMerkleRoot (txs) {
  if (txs != undefined && txs.length > 0) {
    return txs.reduce(function (all, tx) {
      all = string.blake2b(all + tx.id)

      return all
    }, '')
  }

  return false
}

function transmitRoverBlock (block) {
  var coinbaseTransaction = false

  if (block == undefined && block.transactions == undefined) {
    return
  }

  var obj = {}

  obj.blockNumber = block.height
  obj.prevHash = block.reference
  obj.blockHash = block.signature
  obj.root = getMerkleRoot(block.transactions)
  obj.fee = block.fee
  obj.size = block.blocksize
  obj.generator = block.generator
  ;(obj.genSignature = block['nxt-consensus']['generation-signature']),
    (obj.baseTarget = block['nxt-consensus']['base-target']),
    (obj.timestamp = block.timestamp)
  obj.version = block.version
  obj.generator = block.generator
  obj.transactions = block.transactions.reduce(function (all, t) {
    var tx = {
      txHash: t.id,
      // inputs: t.inputs,
      // outputs: t.outputs,
      marked: false
    }

    all.push(tx)

    return all
  }, [])

  // EhQhfpkGXmZhcwDaw8URBh7A5AEAWbKs9oPkzAAmo78Giux746VqtjjWQuQ9J1mUnYCHBPCCXC2QPXSKDG2a7Ts
  // bazt71bScPZ7mbVPAyH7eMT2BMCQWo5U4aHqEckJHvKVbJ34wb9oXdGC7cBY4YNqkEpSpg2yDNU6MivtV4RZUkb

  if (obj.root != false) {
    send('block', obj)
  }
}

function getPrivateKey () {
  return crypto.randomBytes(32)
}

var handleTx = function (tx) {
  async.reduce(
    tx.outputs,
    {
      utxos: new Array(),
      keys: new Array(),
      amount: 0,
      n: 0
    },
    function (memo, out, next) {
      if (out.script.isPublicKeyHashOut()) {
        /// /db.get(out.script.toAddress(), function (err, result) {
        /// /  if (!(err)) {
        //    var key = new PrivateKey(result);
        //    memo.keys.push(key);
        //    var utxo = new Transaction.UnspentOutput({
        //      "txid" : tx.transaction.id,
        //      "vout" : memo.n,
        //      "address" : out.script.toAddress(),
        //      "script" : out.script,
        //      "satoshis" : out.satoshis,
        //      "output" : out
        //    });
        //    memo.utxos.push(utxo);
        //    memo.amount += out.satoshis;
        /// /  };
        //  memo.n++;
        //  next(null, memo);
        /// /});
      }
    },
    function (err, results) {}
  )
}

function onNewTx (tx, block) {
  if (txCache.has(tx.hash)) return

  txCache.set(tx.hash, true)

  if (tx.isCoinbase() == true) {
  }

  // handleTx(tx);
}

function onNewBlock (block) {
  transmitRoverBlock(block)
}

function Network (config) {
  var self = this

  var options = {
    maximumPeers: 112,
    discoveredPeers: 0,
    lastBlock: false,
    quorum: 91,
    peers: {},
    state: {},
    peerData: {},
    key: getPrivateKey(),
    identity: {
      identityPath: '/Users/mtxodus1/Library/Application Support/.blockcollider'
    }
  }

  if (config != undefined) {
    Object.keys(config).map(function (k) {
      config[k] = options[k]
    })
  }

  Object.keys(options).map(function (k) {
    self[k] = options[k]
  })
}

// vim /Users/mtxodus1/Documents/GitHub/bcnode/node_modules/bitcore-p2p/lib/peer.js

Network.prototype = {
  removePeer: function (peer) {
    var self = this

    if (self.peerData[peer.host] != undefined) {
      delete self.peerData[peer.host]
    }

    if (self.peers[peer.host] == undefined) return

    delete self.peers[peer.host]
  },

  indexPeer: function (peer) {
    var self = this

    // if(self.peers[peer.host] != undefined) return;

    self.peers[peer.host] = {
      bestHeight: peer.bestHeight,
      version: peer.version,
      subversion: peer.subversion,
      updated: new Date()
    }
  },

  setState: function (key) {
    var self = this

    var peers = Object.keys(self.peers).reduce(function (all, h) {
      var a = self.peers[h]

      if (a != undefined) {
        a.host = h
        all.push(a)
      }

      return all
    }, [])

    var report = peers.reduce(function (all, peer) {
      var val = peer.bestHeight
      if (all[val] == undefined) {
        all[val] = 1
      } else {
        all[val]++
      }

      return all
    }, {})

    if (Object.keys(report).length < 1) return false

    var ranks = Object.keys(report).sort(function (a, b) {
      if (report[a] > report[b]) {
        return -1
      }

      if (report[b] > report[a]) {
        return 1
      }

      return 0
    })

    if (ranks == undefined || ranks.length < 1) return false

    self.state.bestHeight = ranks[0]

    return ranks[0]
  },

  connect: function () {
    var self = this

    var pool = new Pool({
      network: Networks.livenet,
      maxSize: self.maximumPeers,
      relay: false
    })

    // connect to the network
    pool.connect()

    return pool
  }
}

function getLastHeight (cb) {
  var host = WAVES_NODE_HOST
  var url = host + '/blocks/height'

  fs.readFile('.wavescache', 'utf8', function (err, file) {
    if (err) {
      console.trace(err)
      process.exit(3)
    }

    file = JSON.parse(file)

    LAST_HEIGHT = file.LAST_HEIGHT

    let agent = new https.Agent({ keepAlive: false })

    request({ url: url, json: true, agent: agent }, function (err, res, body) {
      if (err) {
        cb(err)
      } else {
        let newBlock = false

        if (LAST_HEIGHT != 0 && LAST_HEIGHT != body.height) {
          LAST_HEIGHT = LAST_HEIGHT + 1
          newBlock = true
        } else if (LAST_HEIGHT == 0) {
          newBlock = true
          LAST_HEIGHT = body.height
        } else if (LAST_HEIGHT == body.height) {
          newBlock = false
        }

        fs.writeFile(
          '.wavescache',
          JSON.stringify({ LAST_HEIGHT: LAST_HEIGHT }),
          function (err) {
            if (err) {
              console.trace(err)
              process.exit(3)
            }

            if (newBlock == true) {
              cb(null, LAST_HEIGHT)
            } else {
              cb(null, false)
            }
          }
        )
      }
    })
  })
}

var Controller = {
  dpt: false,

  interfaces: [],

  init: function (config) {
    send('log', 'quorum unecessary')

    var host = WAVES_NODE_HOST
    var url = host + '/blocks/at'

    function cycle (w) {
      getLastHeight(function (err, h) {
        // var h = w;
        var u = url + '/' + h

        if (h == false) {
          setTimeout(function () {
            cycle(w)
          }, 5000)
        } else {
          let agent = new https.Agent({ keepAlive: false })

          request({ url: u, json: true, agent: agent }, function (
            err,
            res,
            body
          ) {
            if (err) {
              fs.writeFile(
                '.wavescache',
                JSON.stringify({ LAST_HEIGHT: h - 1 }),
                function (err) {
                  setTimeout(function () {
                    cycle(h)
                  }, 5000)
                }
              )
            } else if (body.status == 'error') {
              var t = 5000

              if (
                body.details != undefined &&
                body.details === 'No block for this height'
              ) {
                t = 19000
              }

              fs.writeFile(
                '.wavescache',
                JSON.stringify({ LAST_HEIGHT: h - 1 }),
                function (err) {
                  setTimeout(function () {
                    cycle(h)
                  }, t)
                }
              )
            } else {
              transmitRoverBlock(body)
              setTimeout(function () {
                h = h + 1
                cycle(h)
              }, 6000)
            }
          })
        }
      })
    }

    cycle(1)
  },

  close: function () {
    Controller.interfaces.map(function (c) {
      c.close()
    })
  }
}

process.on('message', function (msg) {
  var args = []
  var func = ''

  if (msg.func != undefined) {
    func = msg.func

    if (msg.args != undefined) {
      args = msg.args
    }

    if (Controller[msg.func] != undefined) {
      // Controller[func].apply(this, args);
      Controller[func].call(args)
    }
  }
})
