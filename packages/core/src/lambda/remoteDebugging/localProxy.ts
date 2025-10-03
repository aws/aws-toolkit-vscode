/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as net from 'net'
import WebSocket from 'ws'
import * as crypto from 'crypto'
import { getLogger } from '../../shared/logger/logger'
import { v4 as uuidv4 } from 'uuid'
import * as protobuf from 'protobufjs'

const logger = getLogger()

// Define the message types from the protocol
enum MessageType {
    UNKNOWN = 0,
    DATA = 1,
    STREAM_START = 2,
    STREAM_RESET = 3,
    SESSION_RESET = 4,
    SERVICE_IDS = 5,
    CONNECTION_START = 6,
    CONNECTION_RESET = 7,
}

// Interface for tunnel info
export interface TunnelInfo {
    tunnelId: string
    sourceToken: string
    destinationToken: string
}

// Interface for TCP connection
interface TcpConnection {
    socket: net.Socket
    streamId: number
    connectionId: number
}

/**
 * LocalProxy class that handles WebSocket connection to IoT secure tunneling
 * and sets up a TCP adapter as a local proxy
 */
export class LocalProxy {
    private ws: WebSocket.WebSocket | undefined = undefined
    private tcpServer: net.Server | undefined = undefined
    private tcpConnections: Map<number, TcpConnection> = new Map()
    private isConnected: boolean = false
    private reconnectAttempts: number = 0
    private maxReconnectAttempts: number = 10
    private reconnectInterval: number = 2500 // 2.5 seconds
    private pingInterval: NodeJS.Timeout | undefined = undefined
    private serviceId: string = 'WSS'
    private currentStreamId: number = 1
    private nextConnectionId: number = 1
    private localPort: number = 0
    private region: string = ''
    private accessToken: string = ''
    private Message: protobuf.Type | undefined = undefined
    private clientToken: string = ''
    private eventHandlers: { [key: string]: any[] } = {}
    private isDisposed: boolean = false

    constructor() {
        void this.loadProtobufDefinition()
    }

    // Define the protobuf schema as a string constant
    private static readonly protobufSchema = `
    syntax = "proto3";

    package com.amazonaws.iot.securedtunneling;

    message Message {
        Type    type         = 1;
        int32   streamId     = 2;
        bool    ignorable    = 3;
        bytes   payload      = 4;
        string  serviceId = 5;
        repeated string availableServiceIds = 6;
        uint32 connectionId = 7;

        enum Type {
            UNKNOWN = 0;
            DATA = 1;
            STREAM_START = 2;
            STREAM_RESET = 3;
            SESSION_RESET = 4;
            SERVICE_IDS = 5;
            CONNECTION_START = 6;
            CONNECTION_RESET = 7;
        }
    }`

    /**
     * Load the protobuf definition from the embedded schema string
     */
    private async loadProtobufDefinition(): Promise<void> {
        try {
            if (this.Message) {
                // Already loaded, don't parse again
                return
            }

            const root = protobuf.parse(LocalProxy.protobufSchema).root
            this.Message = root.lookupType('com.amazonaws.iot.securedtunneling.Message')

            if (!this.Message) {
                throw new Error('Failed to load Message type from protobuf definition')
            }

            logger.debug('Protobuf definition loaded successfully')
        } catch (error) {
            logger.error(`Error loading protobuf definition:${error}`)
            throw error
        }
    }

    /**
     * Start the local proxy
     * @param region AWS region
     * @param sourceToken Source token for the tunnel
     * @param port Local port to listen on
     */
    public async start(region: string, sourceToken: string, port: number = 0): Promise<number> {
        // Reset disposal state when starting
        this.isDisposed = false

        this.region = region
        this.accessToken = sourceToken

        try {
            // Start TCP server first
            this.localPort = await this.startTcpServer(port)

            // Then connect to WebSocket
            await this.connectWebSocket()

            return this.localPort
        } catch (error) {
            logger.error(`Failed to start local proxy:${error}`)
            this.stop()
            throw error
        }
    }

    /**
     * Stop the local proxy and clean up all resources
     */
    public stop(): void {
        if (this.isDisposed) {
            logger.debug('LocalProxy already stopped, skipping duplicate stop call')
            return
        }

        logger.debug('Stopping LocalProxy and cleaning up resources')

        // Cancel any pending reconnect timeouts
        if (this.eventHandlers['reconnectTimeouts']) {
            for (const timeoutId of this.eventHandlers['reconnectTimeouts']) {
                clearTimeout(timeoutId as NodeJS.Timeout)
            }
        }

        this.stopPingInterval()
        this.closeWebSocket()
        this.closeTcpServer()

        // Reset all state
        this.clientToken = ''
        this.isConnected = false
        this.reconnectAttempts = 0
        this.currentStreamId = 1
        this.nextConnectionId = 1
        this.localPort = 0
        this.region = ''
        this.accessToken = ''

        // Mark as disposed to prevent duplicate stop calls
        this.isDisposed = true

        // Clear any remaining event handlers reference
        this.eventHandlers = {}
    }

    /**
     * Start the TCP server
     * @param port Port to listen on (0 for random port)
     * @returns The port the server is listening on
     */
    private startTcpServer(port: number): Promise<number> {
        return new Promise((resolve, reject) => {
            try {
                this.tcpServer = net.createServer((socket) => {
                    this.handleNewTcpConnection(socket)
                })

                this.tcpServer.on('error', (err) => {
                    logger.error(`TCP server error:${err}`)
                })

                this.tcpServer.listen(port, '127.0.0.1', () => {
                    const address = this.tcpServer?.address() as net.AddressInfo
                    this.localPort = address.port
                    logger.debug(`TCP server listening on port ${this.localPort}`)
                    resolve(this.localPort)
                })
            } catch (error) {
                logger.error(`Failed to start TCP server:${error}`)
                reject(error)
            }
        })
    }

    /**
     * Close the TCP server and all connections
     */
    private closeTcpServer(): void {
        if (this.tcpServer) {
            logger.debug('Closing TCP server and connections')

            // Remove all listeners from the server
            this.tcpServer.removeAllListeners('error')
            this.tcpServer.removeAllListeners('connection')
            this.tcpServer.removeAllListeners('listening')

            // Close all TCP connections with proper error handling
            for (const connection of this.tcpConnections.values()) {
                try {
                    // Remove all listeners before destroying
                    connection.socket.removeAllListeners('data')
                    connection.socket.removeAllListeners('error')
                    connection.socket.removeAllListeners('close')
                    connection.socket.destroy()
                } catch (err) {
                    logger.error(`Error closing TCP connection: ${err}`)
                }
            }
            this.tcpConnections.clear()

            // Close the server with proper error handling and timeout
            try {
                // Set a timeout in case server.close() hangs
                const serverCloseTimeout = setTimeout(() => {
                    logger.warn('TCP server close timed out, forcing closure')
                    this.tcpServer = undefined
                }, 5000)

                this.tcpServer.close(() => {
                    clearTimeout(serverCloseTimeout)
                    logger.debug('TCP server closed successfully')
                    this.tcpServer = undefined
                })
            } catch (err) {
                logger.error(`Error closing TCP server: ${err}`)
                this.tcpServer = undefined
            }
        }
    }

    /**
     * Handle a new TCP connection with proper resource management
     * @param socket The TCP socket
     */
    private handleNewTcpConnection(socket: net.Socket): void {
        if (!this.isConnected || this.isDisposed) {
            logger.warn('WebSocket not connected or proxy disposed, rejecting TCP connection')
            socket.destroy()
            return
        }

        const connectionId = this.nextConnectionId++
        const streamId = this.currentStreamId

        logger.debug(`New TCP connection: ${connectionId}`)

        // Track event handlers for this connection
        const handlers: { [event: string]: (...args: any[]) => void } = {}

        // Data handler
        const dataHandler = (data: Buffer) => {
            this.sendData(streamId, connectionId, data)
        }
        socket.on('data', dataHandler)
        handlers.data = dataHandler

        // Error handler
        const errorHandler = (err: Error) => {
            logger.error(`TCP connection ${connectionId} error: ${err}`)
            this.sendConnectionReset(streamId, connectionId)

            // Cleanup handlers on error
            this.cleanupSocketHandlers(socket, handlers)
        }
        socket.on('error', errorHandler)
        handlers.error = errorHandler

        // Close handler
        const closeHandler = () => {
            logger.debug(`TCP connection ${connectionId} closed`)

            // Remove from connections map and send reset
            this.tcpConnections.delete(connectionId)
            this.sendConnectionReset(streamId, connectionId)

            // Cleanup handlers on close
            this.cleanupSocketHandlers(socket, handlers)
        }
        socket.on('close', closeHandler)
        handlers.close = closeHandler

        // Set a timeout to close idle connections after 10 minutes
        const idleTimeout = setTimeout(
            () => {
                if (this.tcpConnections.has(connectionId)) {
                    logger.debug(`Closing idle TCP connection ${connectionId}`)
                    socket.destroy()
                }
            },
            10 * 60 * 1000
        )

        // Clear timeout on socket close
        socket.once('close', () => {
            clearTimeout(idleTimeout)
        })

        // Store the connection
        const connection: TcpConnection = {
            socket,
            streamId,
            connectionId,
        }
        this.tcpConnections.set(connectionId, connection)

        // Send StreamStart for the first connection, ConnectionStart for subsequent ones
        if (connectionId === 1) {
            this.sendStreamStart(streamId, connectionId)
        } else {
            this.sendConnectionStart(streamId, connectionId)
        }
    }

    /**
     * Helper method to clean up socket event handlers
     * @param socket The socket to clean up
     * @param handlers The handlers to remove
     */
    private cleanupSocketHandlers(socket: net.Socket, handlers: { [event: string]: (...args: any[]) => void }): void {
        try {
            if (handlers.data) {
                socket.removeListener('data', handlers.data as (...args: any[]) => void)
            }
            if (handlers.error) {
                socket.removeListener('error', handlers.error as (...args: any[]) => void)
            }
            if (handlers.close) {
                socket.removeListener('close', handlers.close as (...args: any[]) => void)
            }
        } catch (error) {
            logger.error(`Error cleaning up socket handlers: ${error}`)
        }
    }

    /**
     * Connect to the WebSocket server with proper event tracking
     */
    private async connectWebSocket(): Promise<void> {
        if (this.ws) {
            this.closeWebSocket()
        }

        // Reset for new connection
        this.isDisposed = false

        return new Promise((resolve, reject) => {
            try {
                const url = `wss://data.tunneling.iot.${this.region}.amazonaws.com:443/tunnel?local-proxy-mode=source`

                if (!this.clientToken) {
                    this.clientToken = uuidv4().replace(/-/g, '')
                }

                this.ws = new WebSocket.WebSocket(url, ['aws.iot.securetunneling-3.0'], {
                    headers: {
                        'access-token': this.accessToken,
                        'client-token': this.clientToken,
                    },
                    handshakeTimeout: 30000, // 30 seconds
                })

                // Track event listeners for proper cleanup
                this.eventHandlers['wsOpen'] = []
                this.eventHandlers['wsMessage'] = []
                this.eventHandlers['wsClose'] = []
                this.eventHandlers['wsError'] = []
                this.eventHandlers['wsPing'] = []
                this.eventHandlers['wsPong'] = []

                // Open handler
                const openHandler = () => {
                    logger.debug('WebSocket connected')
                    this.isConnected = true
                    this.reconnectAttempts = 0
                    this.startPingInterval()
                    resolve()
                }
                this.ws.on('open', openHandler)
                this.eventHandlers['wsOpen'].push(openHandler)

                // Message handler
                const messageHandler = (data: WebSocket.RawData) => {
                    this.handleWebSocketMessage(data)
                }
                this.ws.on('message', messageHandler)
                this.eventHandlers['wsMessage'].push(messageHandler)

                // Close handler
                const closeHandler = (code: number, reason: Buffer) => {
                    logger.debug(`WebSocket closed: ${code} ${reason.toString()}`)
                    this.isConnected = false
                    this.stopPingInterval()

                    // Only attempt reconnect if we haven't explicitly stopped
                    if (!this.isDisposed) {
                        void this.attemptReconnect()
                    }
                }
                this.ws.on('close', closeHandler)
                this.eventHandlers['wsClose'].push(closeHandler)

                // Error handler
                const errorHandler = (err: Error) => {
                    logger.error(`WebSocket error: ${err}`)
                    reject(err)
                }
                this.ws.on('error', errorHandler)
                this.eventHandlers['wsError'].push(errorHandler)

                // Ping handler
                const pingHandler = (data: Buffer) => {
                    // Respond to ping with pong
                    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                        this.ws.pong(data)
                    }
                }
                this.ws.on('ping', pingHandler)
                this.eventHandlers['wsPing'].push(pingHandler)

                // Pong handler
                const pongHandler = () => {
                    logger.debug('Received pong')
                }
                this.ws.on('pong', pongHandler)
                this.eventHandlers['wsPong'].push(pongHandler)

                // Set connection timeout
                const connectionTimeout = setTimeout(() => {
                    if (this.ws && this.ws.readyState !== WebSocket.OPEN) {
                        logger.error('WebSocket connection timed out')
                        this.closeWebSocket()
                        reject(new Error('WebSocket connection timed out'))
                    }
                }, 35000) // 35 seconds (slightly longer than handshake timeout)

                // Add a handler to clear the timeout on successful connection
                this.ws.once('open', () => {
                    clearTimeout(connectionTimeout)
                })
            } catch (error) {
                logger.error(`Failed to connect WebSocket: ${error}`)
                this.isConnected = false
                reject(error)
            }
        })
    }

    /**
     * Close the WebSocket connection with proper cleanup
     */
    private closeWebSocket(): void {
        if (this.ws) {
            try {
                logger.debug('Closing WebSocket connection')

                // Remove all event listeners before closing
                this.ws.removeAllListeners('open')
                this.ws.removeAllListeners('message')
                this.ws.removeAllListeners('close')
                this.ws.removeAllListeners('error')
                this.ws.removeAllListeners('ping')
                this.ws.removeAllListeners('pong')

                // Try to close gracefully first
                if (this.ws.readyState === WebSocket.OPEN) {
                    // Set timeout in case close hangs
                    const closeTimeout = setTimeout(() => {
                        logger.warn('WebSocket close timed out, forcing termination')
                        if (this.ws) {
                            try {
                                this.ws.terminate()
                            } catch (e) {
                                // Ignore errors on terminate after timeout
                            }
                            this.ws = undefined
                        }
                    }, 1000)

                    // Try graceful closure first
                    this.ws.close(1000, 'Normal Closure')

                    // Set up a handler to clear the timeout if close works normally
                    this.ws.once('close', () => {
                        clearTimeout(closeTimeout)
                    })
                } else {
                    // If not open, just terminate
                    this.ws.terminate()
                }
            } catch (error) {
                logger.error(`Error closing WebSocket: ${error}`)
            } finally {
                this.ws = undefined
            }
        }
    }

    /**
     * Start the ping interval to keep the connection alive
     */
    private startPingInterval(): void {
        this.stopPingInterval()

        // Send ping every 30 seconds to keep the connection alive
        this.pingInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                logger.debug('Sending ping')
                try {
                    this.ws.ping(crypto.randomBytes(16))
                } catch (error) {
                    logger.error(`Error sending ping: ${error}`)
                }
            } else {
                // If websocket is no longer open, stop the interval
                this.stopPingInterval()
            }
        }, 30000)
    }

    /**
     * Stop the ping interval with better error handling
     */
    private stopPingInterval(): void {
        try {
            if (this.pingInterval) {
                clearInterval(this.pingInterval)
                this.pingInterval = undefined
                logger.debug('Ping interval stopped')
            }
        } catch (error) {
            logger.error(`Error stopping ping interval: ${error}`)
            this.pingInterval = undefined
        }
    }

    /**
     * Attempt to reconnect to the WebSocket server with better resource management
     */
    private async attemptReconnect(): Promise<void> {
        if (this.isDisposed) {
            logger.debug('LocalProxy is disposed, not attempting reconnect')
            return
        }

        if (!this.clientToken) {
            logger.debug('stop retrying, ws closed manually')
            return
        }

        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            logger.error('Max reconnect attempts reached')
            // Clean up resources when max attempts reached
            this.stop()
            return
        }

        this.reconnectAttempts++
        const delay = this.reconnectInterval * Math.pow(1.5, this.reconnectAttempts - 1)

        logger.debug(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`)

        // Use a tracked timeout that we can clear if needed
        const reconnectTimeoutId = setTimeout(() => {
            if (!this.isDisposed) {
                void this.connectWebSocket().catch((err) => {
                    logger.error(`Reconnect failed: ${err}`)
                })
            } else {
                logger.debug('Reconnect cancelled because LocalProxy was disposed')
            }
        }, delay)

        // Store the timeout ID so it can be cleared if stop() is called
        if (!this.eventHandlers['reconnectTimeouts']) {
            this.eventHandlers['reconnectTimeouts'] = []
        }
        this.eventHandlers['reconnectTimeouts'].push(reconnectTimeoutId)
    }

    /**
     * Handle a WebSocket message
     * @param data The message data
     */
    private handleWebSocketMessage(data: WebSocket.RawData): void {
        try {
            // Handle binary data
            if (Buffer.isBuffer(data)) {
                let offset = 0

                // Process all messages in the buffer
                while (offset < data.length) {
                    // Read the 2-byte length prefix
                    if (offset + 2 > data.length) {
                        logger.error('Incomplete message length prefix')
                        break
                    }

                    const messageLength = data.readUInt16BE(offset)
                    offset += 2

                    // Check if we have the complete message
                    if (offset + messageLength > data.length) {
                        logger.error('Incomplete message data')
                        break
                    }

                    // Extract the message data
                    const messageData = data.slice(offset, offset + messageLength)
                    offset += messageLength

                    // Decode and process the message
                    this.processMessage(messageData)
                }
            } else {
                logger.warn('Received non-buffer WebSocket message')
            }
        } catch (error) {
            logger.error(`Error handling WebSocket message:${error}`)
        }
    }

    /**
     * Process a decoded message
     * @param messageData The message data
     */
    private processMessage(messageData: Buffer): void {
        try {
            if (!this.Message) {
                logger.error('Protobuf Message type not loaded')
                return
            }

            // Decode the message
            const message = this.Message.decode(messageData)

            // Process based on message type
            const typedMessage = message as any
            switch (typedMessage.type) {
                case MessageType.DATA:
                    this.handleDataMessage(message)
                    break

                case MessageType.STREAM_RESET:
                    this.handleStreamReset(message)
                    break

                case MessageType.CONNECTION_RESET:
                    this.handleConnectionReset(message)
                    break

                case MessageType.SESSION_RESET:
                    this.handleSessionReset()
                    break

                case MessageType.SERVICE_IDS:
                    this.handleServiceIds(message)
                    break

                default:
                    logger.debug(`Received message of type ${typedMessage.type}`)
                    break
            }
        } catch (error) {
            logger.error(`Error processing message:${error}`)
        }
    }

    /**
     * Handle a DATA message
     * @param message The message
     */
    private handleDataMessage(message: any): void {
        const { streamId, connectionId, payload } = message

        // Validate stream ID
        if (streamId !== this.currentStreamId) {
            logger.warn(`Received data for invalid stream ID: ${streamId}, current: ${this.currentStreamId}`)
            return
        }

        // Find the connection
        const connection = this.tcpConnections.get(connectionId || 1)
        if (!connection) {
            logger.warn(`Received data for unknown connection ID: ${connectionId}`)
            return
        }

        logger.debug(`Received data for connection ${connectionId} in stream ${streamId}`)

        // Write data to the TCP socket
        if (connection.socket.writable) {
            connection.socket.write(Buffer.from(payload))
        }
    }

    /**
     * Handle a STREAM_RESET message
     * @param message The message
     */
    private handleStreamReset(message: any): void {
        const { streamId } = message

        logger.debug(`Received STREAM_RESET for stream ${streamId}`)

        // Close all connections for this stream
        for (const [connectionId, connection] of this.tcpConnections.entries()) {
            if (connection.streamId === streamId) {
                connection.socket.destroy()
                this.tcpConnections.delete(connectionId)
            }
        }
    }

    /**
     * Handle a CONNECTION_RESET message
     * @param message The message
     */
    private handleConnectionReset(message: any): void {
        const { streamId, connectionId } = message

        logger.debug(`Received CONNECTION_RESET for connection ${connectionId} in stream ${streamId}`)

        // Close the specific connection
        const connection = this.tcpConnections.get(connectionId)
        if (connection) {
            connection.socket.destroy()
            this.tcpConnections.delete(connectionId)
        }
    }

    /**
     * Handle a SESSION_RESET message
     */
    private handleSessionReset(): void {
        logger.debug('Received SESSION_RESET')

        // Close all connections
        for (const connection of this.tcpConnections.values()) {
            connection.socket.destroy()
        }
        this.tcpConnections.clear()

        // Increment stream ID for new connections
        this.currentStreamId++
    }

    /**
     * Handle a SERVICE_IDS message
     * @param message The message
     */
    private handleServiceIds(message: any): void {
        const { availableServiceIds } = message

        logger.debug(`Received SERVICE_IDS: ${availableServiceIds}`)

        // Validate service IDs
        if (Array.isArray(availableServiceIds) && availableServiceIds.length > 0) {
            // Use the first service ID
            this.serviceId = availableServiceIds[0]
        }
    }

    /**
     * Send a message over the WebSocket
     * @param messageType The message type
     * @param streamId The stream ID
     * @param connectionId The connection ID
     * @param payload The payload
     */
    private sendMessage(messageType: MessageType, streamId: number, connectionId: number, payload?: Buffer): void {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            logger.warn('WebSocket not connected, cannot send message')
            return
        }

        if (!this.Message) {
            logger.error('Protobuf Message type not loaded')
            return
        }

        try {
            // Create the message
            const message = {
                type: messageType,
                streamId,
                connectionId,
                serviceId: this.serviceId,
            }

            // Add payload if provided
            const typedMessage: any = message
            if (payload) {
                typedMessage.payload = payload
            }

            // Verify and encode the message
            const err = this.Message.verify(message)
            if (err) {
                throw new Error(`Invalid message: ${err}`)
            }

            const encodedMessage = this.Message.encode(this.Message.create(message)).finish()

            // Create the frame with 2-byte length prefix
            const frameLength = encodedMessage.length
            const frame = Buffer.alloc(2 + frameLength)

            // Write the length prefix
            frame.writeUInt16BE(frameLength, 0)

            // Copy the encoded message
            Buffer.from(encodedMessage).copy(frame, 2)

            // Send the frame
            if (this.ws?.readyState === WebSocket.OPEN) {
                this.ws.send(frame)
            } else {
                logger.warn('WebSocket connection lost before sending message')
            }
        } catch (error) {
            logger.error(`Error sending message: ${error}`)
        }
    }

    /**
     * Send a STREAM_START message
     * @param streamId The stream ID
     * @param connectionId The connection ID
     */
    private sendStreamStart(streamId: number, connectionId: number): void {
        logger.debug(`Sending STREAM_START for stream ${streamId}, connection ${connectionId}`)
        this.sendMessage(MessageType.STREAM_START, streamId, connectionId)
    }

    /**
     * Send a CONNECTION_START message
     * @param streamId The stream ID
     * @param connectionId The connection ID
     */
    private sendConnectionStart(streamId: number, connectionId: number): void {
        logger.debug(`Sending CONNECTION_START for stream ${streamId}, connection ${connectionId}`)
        this.sendMessage(MessageType.CONNECTION_START, streamId, connectionId)
    }

    /**
     * Send a CONNECTION_RESET message
     * @param streamId The stream ID
     * @param connectionId The connection ID
     */
    private sendConnectionReset(streamId: number, connectionId: number): void {
        logger.debug(`Sending CONNECTION_RESET for stream ${streamId}, connection ${connectionId}`)
        this.sendMessage(MessageType.CONNECTION_RESET, streamId, connectionId)
    }

    /**
     * Send data over the WebSocket
     * @param streamId The stream ID
     * @param connectionId The connection ID
     * @param data The data to send
     */
    private sendData(streamId: number, connectionId: number, data: Buffer): void {
        // Split data into chunks if it exceeds the maximum payload size (63kb)
        const maxChunkSize = 63 * 1024 // 63kb

        for (let offset = 0; offset < data.length; offset += maxChunkSize) {
            const chunk = data.slice(offset, offset + maxChunkSize)
            this.sendMessage(MessageType.DATA, streamId, connectionId, chunk)
        }
    }
}
