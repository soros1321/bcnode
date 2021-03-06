/**
 * Copyright (c) 2017-present, blockcollider.org developers, All rights reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

const PeerId = require('peer-id')
const PeerInfo = require('peer-info')
const PeerBook = require('peer-book')
const waterfall = require('async/waterfall')
const pull = require('pull-stream')

const logging = require('../logger')
const config = require('../../config/config')
const Bundle = require('./bundle').default

const PROTOCOL_VERSION = '0.0.1'
const PROTOCOL_PREFIX = `/bc/${PROTOCOL_VERSION}`
const NETWORK_ID = 1

type StatusMsg = {
  networkId: number,
  peerId: ?string,
}

export default class Node {
  _logger: Object // eslint-disable-line no-undef
  _engine: Object // eslint-disable-line no-undef
  _statusMsg: StatusMsg // eslint-disable-line no-undef
  _peers: PeerBook // eslint-disable-line no-undef

  constructor (engine: Object) {
    this._engine = engine
    this._logger = logging.getLogger(__filename)
    this._statusMsg = {
      networkId: NETWORK_ID,
      peerId: null
    }
    this._peers = new PeerBook()
  }

  start () {
    let node: Bundle

    const pipeline = [
      (cb) => PeerInfo.create(cb),
      (peerInfo, cb) => {
        peerInfo.multiaddrs.add(config.p2p.rendezvous)

        node = new Bundle(peerInfo)
        this._logger.debug(`Staring p2p node (self) with ${peerInfo.id.toB58String()}`)
        node.start(cb)

        this._registerMessageHandlers(node)
      }
    ]

    waterfall(pipeline, (err) => {
      if (err) {
        this._logger.error(err)
        throw err
      }

      this._registerEventHandlers(node)
    })

    return true
  }

  _handleEventPeerConnect (node: Object, peer: Object) {
    this._logger.info('Connection established:', peer.id.toB58String())
    node.dialProtocol(peer, `${PROTOCOL_PREFIX}/status`, (err, conn) => {
      if (err) {
        node.hangUp(peer, () => {
          this._logger.error(`${peer.id.toB58String()} disconnected, reason: ${err.message}`)
        })
      }
      const msg = this._statusMsg
      msg.peerId = peer.id.toB58String()
      pull(pull.values([JSON.stringify(msg)]), conn)
    })
  }

  _handleEventPeerDisconnect (peer: Object) {
    this._peers.remove(peer)
    this._logger.info(`Peer ${peer.id.toB58String()} disconnected, removed from book`)
  }

  _handleEventPeerDiscovery (node: Object, peer: Object) {
    this._logger.info(`Discovered: ${peer.id.toB58String()}`)
    node.dial(peer, (err) => {
      if (err) {
        this._logger.warn(`Error while dialing discovered peer ${peer.id.toB58String()}`)
      }
    })
  }

  _handleMessageNewBlock (protocol: Object, conn: Object) {
    pull(
      conn,
      pull.map((v) => v.toString()),
      pull.log() // TODO store to persistence
    )
  }

  _handleMessageStatus (node: Object, protocol: Object, conn: Object) {
    pull(
      conn,
      pull.collect((err, wireData) => {
        if (err) {
          this._logger.warn('Error while processing status')
          return
        }
        try {
          const data = JSON.parse(wireData.toString())
          const { networkId, peerId } = data
          if (networkId !== NETWORK_ID) {
            this._logger.warn(`Disconnecting peer ${peerId} - network id mismatch ${networkId} / ${NETWORK_ID}`)
            node.hangUp(new PeerId(peerId), () => {
              this._logger.info(`${peerId} disconnected`)
            })
            return
          }
        } catch (e) {
          this._logger.error('Error while parsing data')
          return
        }
        conn.getPeerInfo((err, peer) => {
          if (err) {
            this._logger.error(`Cannot get peer info ${err}`)
            return
          }
          this._peers.put(peer)
          this._logger.info(`Status handled successfuly, added peer ${peer.id.toB58String()}`)
        })
      })
    )
  }

  _registerEventHandlers (node: Object) {
    node.on('peer:discovery', (peer) => this._handleEventPeerDiscovery(node, peer))
    node.on('peer:connect', (peer) => this._handleEventPeerConnect(node, peer))
    node.on('peer:disconnect', (peer) => this._handleEventPeerDisconnect(peer))
  }

  _registerMessageHandlers (node: Object) {
    node.handle(`${PROTOCOL_PREFIX}/newblock`, (protocol, conn) => this._handleMessageNewBlock(protocol, conn))
    node.handle(`${PROTOCOL_PREFIX}/status`, (protocol, conn) => this._handleMessageStatus(node, protocol, conn))
  }
}
