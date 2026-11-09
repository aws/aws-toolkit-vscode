/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import sinon from 'sinon'
import WebSocket from 'ws'
import { LocalProxy } from '../../../lambda/remoteDebugging/localProxy'

describe('LocalProxy', () => {
    let sandbox: sinon.SinonSandbox
    let localProxy: LocalProxy

    beforeEach(() => {
        sandbox = sinon.createSandbox()
        localProxy = new LocalProxy()
    })

    afterEach(() => {
        localProxy.stop()
        sandbox.restore()
    })

    describe('Constructor', () => {
        it('should initialize with default values', () => {
            const proxy = new LocalProxy()
            assert.strictEqual((proxy as any).isConnected, false, 'Should not be connected initially')
            assert.strictEqual((proxy as any).reconnectAttempts, 0, 'Should have zero reconnect attempts')
            assert.strictEqual((proxy as any).currentStreamId, 1, 'Should start with stream ID 1')
            assert.strictEqual((proxy as any).nextConnectionId, 1, 'Should start with connection ID 1')
        })
    })

    describe('Protobuf Loading', () => {
        it('should load protobuf definition successfully', async () => {
            const proxy = new LocalProxy()
            await (proxy as any).loadProtobufDefinition()

            assert((proxy as any).Message, 'Should load Message type')
            assert.strictEqual(typeof (proxy as any).Message, 'object', 'Message should be a protobuf Type object')
            assert.strictEqual((proxy as any).Message.constructor.name, 'Type', 'Message should be a protobuf Type')
        })

        it('should not reload protobuf definition if already loaded', async () => {
            const proxy = new LocalProxy()
            await (proxy as any).loadProtobufDefinition()
            const firstMessage = (proxy as any).Message

            await (proxy as any).loadProtobufDefinition()
            const secondMessage = (proxy as any).Message

            assert.strictEqual(firstMessage, secondMessage, 'Should not reload protobuf definition')
        })
    })

    describe('TCP Server Management', () => {
        it('should close TCP server and connections properly', () => {
            const mockSocket = {
                removeAllListeners: sandbox.stub(),
                destroy: sandbox.stub(),
            }

            const mockServer = {
                removeAllListeners: sandbox.stub(),
                close: sandbox.stub().callsArg(0),
            }

            // Set up mock state
            ;(localProxy as any).tcpServer = mockServer
            ;(localProxy as any).tcpConnections = new Map([[1, { socket: mockSocket }]])
            ;(localProxy as any).closeTcpServer()

            assert(mockSocket.removeAllListeners.called, 'Should remove socket listeners')
            assert(mockSocket.destroy.calledOnce, 'Should destroy socket')
            assert(mockServer.removeAllListeners.called, 'Should remove server listeners')
            assert(mockServer.close.calledOnce, 'Should close server')
        })
    })

    describe('WebSocket Connection Management', () => {
        it('should create WebSocket with correct URL and headers', async () => {
            const mockWs = {
                on: sandbox.stub(),
                once: sandbox.stub(),
                readyState: WebSocket.OPEN,
                removeAllListeners: sandbox.stub(),
                close: sandbox.stub(),
                terminate: sandbox.stub(),
            }

            // Set up LocalProxy with required properties
            ;(localProxy as any).region = 'us-east-1'
            ;(localProxy as any).accessToken = 'test-access-token'

            // Mock the WebSocket constructor
            const WebSocketStub = sandbox.stub().returns(mockWs)
            sandbox.stub(WebSocket, 'WebSocket').callsFake(WebSocketStub)

            // Mock the open event to resolve the promise
            mockWs.on.withArgs('open').callsArg(1)

            await (localProxy as any).connectWebSocket()

            assert(WebSocketStub.calledOnce, 'Should create WebSocket')
            const [url, protocols, options] = WebSocketStub.getCall(0).args

            assert(url.includes('wss://data.tunneling.iot.'), 'Should use correct WebSocket URL')
            assert(url.includes('.amazonaws.com:443/tunnel'), 'Should use correct WebSocket URL')
            assert(url.includes('local-proxy-mode=source'), 'Should set local proxy mode')
            assert.deepStrictEqual(protocols, ['aws.iot.securetunneling-3.0'], 'Should use correct protocol')
            assert(options && options.headers && options.headers['access-token'], 'Should include access token header')
            assert(options && options.headers && options.headers['client-token'], 'Should include client token header')
        })

        it('should handle WebSocket connection errors', async () => {
            const mockWs = {
                on: sandbox.stub(),
                once: sandbox.stub(),
                readyState: WebSocket.CONNECTING,
                removeAllListeners: sandbox.stub(),
                close: sandbox.stub(),
                terminate: sandbox.stub(),
            }

            sandbox.stub(WebSocket, 'WebSocket').returns(mockWs)

            // Mock the error event
            mockWs.on.withArgs('error').callsArgWith(1, new Error('Connection failed'))

            await assert.rejects(
                async () => await (localProxy as any).connectWebSocket(),
                /Connection failed/,
                'Should throw error on WebSocket connection failure'
            )
        })

        it('should close WebSocket connection properly', () => {
            const mockWs = {
                readyState: WebSocket.OPEN,
                removeAllListeners: sandbox.stub(),
                close: sandbox.stub(),
                terminate: sandbox.stub(),
                once: sandbox.stub(),
            }

            ;(localProxy as any).ws = mockWs
            ;(localProxy as any).closeWebSocket()

            assert(mockWs.removeAllListeners.called, 'Should remove all listeners')
            assert(mockWs.close.calledWith(1000, 'Normal Closure'), 'Should close with normal closure code')
        })

        it('should terminate WebSocket if not open', () => {
            const mockWs = {
                readyState: WebSocket.CONNECTING,
                removeAllListeners: sandbox.stub(),
                close: sandbox.stub(),
                terminate: sandbox.stub(),
            }

            ;(localProxy as any).ws = mockWs
            ;(localProxy as any).closeWebSocket()

            assert(mockWs.terminate.calledOnce, 'Should terminate WebSocket if not open')
        })
    })

    describe('Ping/Pong Management', () => {
        it('should start ping interval', () => {
            const setIntervalStub = sandbox.stub(global, 'setInterval').returns({} as any)

            ;(localProxy as any).startPingInterval()

            assert(setIntervalStub.calledOnce, 'Should start ping interval')
            assert.strictEqual(setIntervalStub.getCall(0).args[1], 30000, 'Should ping every 30 seconds')
        })

        it('should stop ping interval', () => {
            const clearIntervalStub = sandbox.stub(global, 'clearInterval')
            const mockInterval = {} as any
            ;(localProxy as any).pingInterval = mockInterval
            ;(localProxy as any).stopPingInterval()

            assert(clearIntervalStub.calledWith(mockInterval), 'Should clear ping interval')
            assert.strictEqual((localProxy as any).pingInterval, undefined, 'Should clear interval reference')
        })

        it('should send ping when WebSocket is open', () => {
            const mockWs = {
                readyState: WebSocket.OPEN,
                ping: sandbox.stub(),
            }

            ;(localProxy as any).ws = mockWs

            // Simulate ping interval callback
            const setIntervalStub = sandbox.stub(global, 'setInterval')
            ;(localProxy as any).startPingInterval()

            const pingCallback = setIntervalStub.getCall(0).args[0]
            pingCallback()

            assert(mockWs.ping.calledOnce, 'Should send ping')
        })
    })

    describe('Message Processing', () => {
        beforeEach(async () => {
            // Load protobuf definition
            await (localProxy as any).loadProtobufDefinition()
        })

        it('should process binary WebSocket messages', () => {
            const processMessageStub = sandbox.stub(localProxy as any, 'processMessage')

            // Create a mock message buffer with length prefix
            const messageData = Buffer.from('test message')
            const buffer = Buffer.alloc(2 + messageData.length)
            buffer.writeUInt16BE(messageData.length, 0)
            messageData.copy(buffer, 2)
            ;(localProxy as any).handleWebSocketMessage(buffer)

            assert(processMessageStub.calledOnce, 'Should process message')
            assert(processMessageStub.calledWith(messageData), 'Should pass correct message data')
        })

        it('should handle incomplete message data', () => {
            const processMessageStub = sandbox.stub(localProxy as any, 'processMessage')

            // Create incomplete buffer (only length prefix)
            const buffer = Buffer.alloc(2)
            buffer.writeUInt16BE(100, 0) // Claims 100 bytes but buffer is only 2
            ;(localProxy as any).handleWebSocketMessage(buffer)

            assert(processMessageStub.notCalled, 'Should not process incomplete message')
        })

        it('should handle non-buffer WebSocket messages', () => {
            const processMessageStub = sandbox.stub(localProxy as any, 'processMessage')

            ;(localProxy as any).handleWebSocketMessage('string message')

            assert(processMessageStub.notCalled, 'Should not process non-buffer messages')
        })
    })

    describe('TCP Connection Handling', () => {
        beforeEach(() => {
            ;(localProxy as any).isConnected = true
            ;(localProxy as any).isDisposed = false
        })

        it('should handle new TCP connections when connected', () => {
            const mockSocket = {
                on: sandbox.stub(),
                destroy: sandbox.stub(),
                once: sandbox.stub(),
            }

            const sendStreamStartStub = sandbox.stub(localProxy as any, 'sendStreamStart')

            ;(localProxy as any).handleNewTcpConnection(mockSocket)

            assert(mockSocket.on.calledWith('data'), 'Should listen for data events')
            assert(mockSocket.on.calledWith('error'), 'Should listen for error events')
            assert(mockSocket.on.calledWith('close'), 'Should listen for close events')
            assert(sendStreamStartStub.calledOnce, 'Should send stream start for first connection')
        })

        it('should reject TCP connections when not connected', () => {
            ;(localProxy as any).isConnected = false

            const mockSocket = {
                destroy: sandbox.stub(),
            }

            ;(localProxy as any).handleNewTcpConnection(mockSocket)

            assert(mockSocket.destroy.calledOnce, 'Should destroy socket when not connected')
        })

        it('should reject TCP connections when disposed', () => {
            ;(localProxy as any).isDisposed = true

            const mockSocket = {
                destroy: sandbox.stub(),
            }

            ;(localProxy as any).handleNewTcpConnection(mockSocket)

            assert(mockSocket.destroy.calledOnce, 'Should destroy socket when disposed')
        })

        it('should send connection start for subsequent connections', () => {
            ;(localProxy as any).nextConnectionId = 2 // Second connection

            const mockSocket = {
                on: sandbox.stub(),
                destroy: sandbox.stub(),
                once: sandbox.stub(),
            }

            const sendConnectionStartStub = sandbox.stub(localProxy as any, 'sendConnectionStart')

            ;(localProxy as any).handleNewTcpConnection(mockSocket)

            assert(sendConnectionStartStub.calledOnce, 'Should send connection start for subsequent connections')
        })
    })

    describe('Lifecycle Management', () => {
        it('should start proxy successfully', async () => {
            const startTcpServerStub = sandbox.stub(localProxy as any, 'startTcpServer').resolves(9229)
            const connectWebSocketStub = sandbox.stub(localProxy as any, 'connectWebSocket').resolves()

            const port = await localProxy.start('us-east-1', 'source-token', 9229)

            assert.strictEqual(port, 9229, 'Should return assigned port')
            assert(startTcpServerStub.calledWith(9229), 'Should start TCP server')
            assert(connectWebSocketStub.calledOnce, 'Should connect WebSocket')
            assert.strictEqual((localProxy as any).region, 'us-east-1', 'Should store region')
            assert.strictEqual((localProxy as any).accessToken, 'source-token', 'Should store access token')
        })

        it('should handle start errors and cleanup', async () => {
            sandbox.stub(localProxy as any, 'startTcpServer').resolves(9229)
            sandbox.stub(localProxy as any, 'connectWebSocket').rejects(new Error('WebSocket failed'))
            const stopStub = sandbox.stub(localProxy, 'stop')

            await assert.rejects(
                async () => await localProxy.start('us-east-1', 'source-token', 9229),
                /WebSocket failed/,
                'Should throw error on start failure'
            )

            assert(stopStub.calledOnce, 'Should cleanup on start failure')
        })

        it('should stop proxy and cleanup resources', () => {
            const stopPingIntervalStub = sandbox.stub(localProxy as any, 'stopPingInterval')
            const closeWebSocketStub = sandbox.stub(localProxy as any, 'closeWebSocket')
            const closeTcpServerStub = sandbox.stub(localProxy as any, 'closeTcpServer')

            // Set up some state
            ;(localProxy as any).isConnected = true
            ;(localProxy as any).reconnectAttempts = 5
            ;(localProxy as any).clientToken = 'test-token'

            localProxy.stop()

            assert(stopPingIntervalStub.calledOnce, 'Should stop ping interval')
            assert(closeWebSocketStub.calledOnce, 'Should close WebSocket')
            assert(closeTcpServerStub.calledOnce, 'Should close TCP server')
            assert.strictEqual((localProxy as any).isConnected, false, 'Should reset connection state')
            assert.strictEqual((localProxy as any).reconnectAttempts, 0, 'Should reset reconnect attempts')
            assert.strictEqual((localProxy as any).clientToken, '', 'Should clear client token')
            assert.strictEqual((localProxy as any).isDisposed, true, 'Should mark as disposed')
        })

        it('should handle duplicate stop calls gracefully', () => {
            const stopPingIntervalStub = sandbox.stub(localProxy as any, 'stopPingInterval')

            localProxy.stop()
            localProxy.stop() // Second call

            // Should not throw error and should handle gracefully
            assert(stopPingIntervalStub.calledOnce, 'Should only stop once')
        })
    })

    describe('Message Sending', () => {
        beforeEach(async () => {
            await (localProxy as any).loadProtobufDefinition()
        })

        it('should send messages when WebSocket is open', () => {
            const mockWs = {
                readyState: WebSocket.OPEN,
                send: sandbox.stub(),
            }

            ;(localProxy as any).ws = mockWs
            ;(localProxy as any).serviceId = 'WSS'
            ;(localProxy as any).sendMessage(1, 1, 1, Buffer.from('test'))

            assert(mockWs.send.calledOnce, 'Should send message')
            const sentData = mockWs.send.getCall(0).args[0]
            assert(Buffer.isBuffer(sentData), 'Should send buffer data')
            assert(sentData.length > 2, 'Should include length prefix')
        })

        it('should not send messages when WebSocket is not open', () => {
            const mockWs = {
                readyState: WebSocket.CONNECTING,
                send: sandbox.stub(),
            }

            ;(localProxy as any).ws = mockWs
            ;(localProxy as any).sendMessage(1, 1, 1, Buffer.from('test'))

            assert(mockWs.send.notCalled, 'Should not send when WebSocket is not open')
        })

        it('should split large data into chunks', () => {
            const mockWs = {
                readyState: WebSocket.OPEN,
                send: sandbox.stub(),
            }

            ;(localProxy as any).ws = mockWs

            // Create data larger than max chunk size (63KB)
            const largeData = Buffer.alloc(70 * 1024, 'a')

            ;(localProxy as any).sendData(1, 1, largeData)

            assert(mockWs.send.calledTwice, 'Should split large data into chunks')
        })
    })
})
