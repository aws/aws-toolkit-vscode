/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 *
 * This file contains code copied from the following places:
 * - https://github.com/jeanp413/open-remote-ssh
 *   Original copyright: (c) 2022
 *   Originally released under MIT license
 * - https://github.com/sanketbajoria/ssh2-promise
 *   Original copyright: Copyright (c) 2015 Sanket Bajoria
 *   Originally released under MIT license
 */

import { EventEmitter } from 'events'
import * as net from 'net'
import { Server } from 'net'
import { Client, ClientChannel, ClientErrorExtensions, ConnectConfig, ShellOptions } from 'ssh2'
import { rejectAfterSecondsElapsed } from './common/promiseUtils'

const establishShellTimeoutSeconds = 10

export interface SSHConnectConfig extends ConnectConfig {
    /** Optional Unique ID attached to ssh connection. */
    uniqueId?: string
    /** Automatic retry to connect, after disconnect. Default true */
    reconnect?: boolean
    /** Number of reconnect retry, after disconnect. Default 10 */
    reconnectTries?: number
    /** Delay after which reconnect should be done. Default 5000ms */
    reconnectDelay?: number
}

export interface SSHTunnelConfig {
    /** Remote Address to connect */
    remoteAddr?: string
    /** Local port to bind to. By default, it will bind to a random port, if not passed */
    localPort?: number
    /** Remote Port to connect */
    remotePort?: number
    /** Remote socket path to connect */
    remoteSocketPath?: string
    /**  Unique name */
    name?: string
}

const defaultOptions: Partial<SSHConnectConfig> = {
    reconnect: false,
    port: 22,
    reconnectTries: 3,
    reconnectDelay: 5000,
}

const SSHConstants = {
    CHANNEL: {
        SSH: 'ssh',
        TUNNEL: 'tunnel',
        X11: 'x11',
    },
    STATUS: {
        BEFORECONNECT: 'beforeconnect',
        CONNECT: 'connect',
        BEFOREDISCONNECT: 'beforedisconnect',
        DISCONNECT: 'disconnect',
    },
}

interface CommandResult {
    stdout: string
    stderr: string
}

/**
 * Execute a command over a `shell` channel. This is currently used as a workaround instead of `exec` in order to be
 * compatible with SageMaker Spaces.
 */
export async function executeShellCommand(
    connection: SSHConnection,
    command: string,
    env: { [index: string]: string | undefined }
): Promise<CommandResult> {
    const stream = await Promise.race([
        // Arbitrary timeout for the shell to be established.
        rejectAfterSecondsElapsed<ClientChannel>(
            establishShellTimeoutSeconds,
            new Error('Timed out while attempting to establish a remote shell.')
        ),
        connection.shell({ env }),
    ])

    // Then return a promise for the command execution
    return new Promise<CommandResult>((resolve, reject) => {
        let stdout = ''
        let stderr = ''

        stream!.on('close', () => {
            resolve({
                stdout: stdout,
                stderr: stderr,
            })
        })
        stream!.on('error', (error: any) => {
            reject(new Error(`Shell stream error: ${error}`))
        })
        stream!.on('data', (data: any) => {
            stdout += data.toString()
        })
        stream!.stderr.on('data', (data: any) => {
            stderr += data.toString()
        })

        // Send command and exit afterward.
        // This will lead to the `close` event being emitted after all stdout/stderr data has been received.
        stream!.end(`${command}\nexit\n`)
    })
}

// This class is mostly unmodified from jeanp413/open-remote-ssh, aside from removing unused features.
export default class SSHConnection extends EventEmitter {
    public config: SSHConnectConfig

    private activeTunnels: { [index: string]: SSHTunnelConfig & { server: Server } } = {}
    private __$connectPromise?: Promise<SSHConnection>
    private __retries: number = 0
    private __err: (Error & ClientErrorExtensions & { code?: string }) | undefined
    private sshConnection?: Client

    constructor(options: SSHConnectConfig) {
        super()
        this.config = Object.assign({}, defaultOptions, options)
        this.config.uniqueId = this.config.uniqueId || `${this.config.username}@${this.config.host}`
    }

    /**
     * Emit message on this channel
     */
    override emit(channel: string, status: string, payload?: any): boolean {
        super.emit(channel, status, this, payload)
        return super.emit(`${channel}:${status}`, this, payload)
    }

    /**
     * Get shell socket
     */
    shell(options: ShellOptions = {}): Promise<ClientChannel> {
        return this.connect().then(() => {
            return new Promise<ClientChannel>((resolve, reject) => {
                this.sshConnection!.shell(options, (err, stream) => (err ? reject(err) : resolve(stream)))
            })
        })
    }

    /**
     * Forward out
     */
    forwardOut(srcIP: string, srcPort: number, destIP: string, destPort: number): Promise<ClientChannel> {
        return this.connect().then(() => {
            return new Promise((resolve, reject) => {
                this.sshConnection!.forwardOut(srcIP, srcPort, destIP, destPort, (err, stream) => {
                    if (err) {
                        return reject(err)
                    }
                    resolve(stream)
                })
            })
        })
    }

    /**
     * Close SSH Connection
     */
    close(): Promise<void> {
        this.emit(SSHConstants.CHANNEL.SSH, SSHConstants.STATUS.BEFOREDISCONNECT)
        return this.closeTunnel().then(() => {
            if (this.sshConnection) {
                this.sshConnection.end()
                this.emit(SSHConstants.CHANNEL.SSH, SSHConstants.STATUS.DISCONNECT)
            }
        })
    }

    /**
     * Connect the SSH Connection
     */
    connect(c?: SSHConnectConfig): Promise<SSHConnection> {
        this.config = Object.assign(this.config, c)
        ++this.__retries

        if (this.__$connectPromise) {
            return this.__$connectPromise
        }

        this.__$connectPromise = new Promise((resolve, reject) => {
            this.emit(SSHConstants.CHANNEL.SSH, SSHConstants.STATUS.BEFORECONNECT)
            if (
                !this.config ||
                typeof this.config === 'function' ||
                !(this.config.host || this.config.sock) ||
                !this.config.username
            ) {
                reject(`Invalid SSH connection configuration host/username can't be empty`)
                this.__$connectPromise = undefined
                return
            }

            // Start ssh server connection
            this.sshConnection = new Client()
            this.sshConnection
                .on('ready', () => {
                    this.emit(SSHConstants.CHANNEL.SSH, SSHConstants.STATUS.CONNECT)
                    this.__retries = 0
                    this.__err = undefined
                    resolve(this)
                })
                .on('error', (err) => {
                    this.emit(SSHConstants.CHANNEL.SSH, SSHConstants.STATUS.DISCONNECT, { err: err })
                    this.__err = err
                })
                .on('close', () => {
                    this.emit(SSHConstants.CHANNEL.SSH, SSHConstants.STATUS.DISCONNECT, { err: this.__err })
                    if (
                        this.config.reconnect &&
                        this.__retries <= this.config.reconnectTries! &&
                        this.__err &&
                        this.__err.level !== 'client-authentication' &&
                        this.__err.code !== 'ENOTFOUND'
                    ) {
                        setTimeout(() => {
                            this.__$connectPromise = undefined
                            resolve(this.connect())
                        }, this.config.reconnectDelay)
                    } else {
                        reject(this.__err)
                    }
                })
                .connect(this.config)
        })
        return this.__$connectPromise
    }

    /**
     * Get existing tunnel by name
     */
    getTunnel(name: string) {
        return this.activeTunnels[name]
    }

    /**
     * Add new tunnel if not exist
     */
    addTunnel(SSHTunnelConfig: SSHTunnelConfig): Promise<SSHTunnelConfig & { server: Server }> {
        SSHTunnelConfig.name =
            SSHTunnelConfig.name ||
            `${SSHTunnelConfig.remoteAddr}@${SSHTunnelConfig.remotePort || SSHTunnelConfig.remoteSocketPath}`
        this.emit(SSHConstants.CHANNEL.TUNNEL, SSHConstants.STATUS.BEFORECONNECT, { SSHTunnelConfig: SSHTunnelConfig })
        if (this.getTunnel(SSHTunnelConfig.name)) {
            this.emit(SSHConstants.CHANNEL.TUNNEL, SSHConstants.STATUS.CONNECT, { SSHTunnelConfig: SSHTunnelConfig })
            return Promise.resolve(this.getTunnel(SSHTunnelConfig.name))
        } else {
            return new Promise((resolve, reject) => {
                const server: net.Server = net.createServer().on('connection', (socket) => {
                    void this.connect().then(() => {
                        if (SSHTunnelConfig.remotePort) {
                            this.sshConnection!.forwardOut(
                                '127.0.0.1',
                                0,
                                SSHTunnelConfig.remoteAddr!,
                                SSHTunnelConfig.remotePort!,
                                (err, stream) => {
                                    if (err) {
                                        this.emit(SSHConstants.CHANNEL.TUNNEL, SSHConstants.STATUS.DISCONNECT, {
                                            SSHTunnelConfig: SSHTunnelConfig,
                                            err: err,
                                        })
                                        return
                                    }
                                    stream.pipe(socket)
                                    socket.pipe(stream)
                                }
                            )
                        } else {
                            this.sshConnection!.openssh_forwardOutStreamLocal(
                                SSHTunnelConfig.remoteSocketPath!,
                                (err, stream) => {
                                    if (err) {
                                        this.emit(SSHConstants.CHANNEL.TUNNEL, SSHConstants.STATUS.DISCONNECT, {
                                            SSHTunnelConfig: SSHTunnelConfig,
                                            err: err,
                                        })
                                        return
                                    }
                                    stream.pipe(socket)
                                    socket.pipe(stream)
                                }
                            )
                        }
                    })
                })

                SSHTunnelConfig.localPort = SSHTunnelConfig.localPort || 0
                server
                    .on('listening', () => {
                        SSHTunnelConfig.localPort = (server.address() as net.AddressInfo).port
                        this.activeTunnels[SSHTunnelConfig.name!] = Object.assign({}, { server }, SSHTunnelConfig)
                        this.emit(SSHConstants.CHANNEL.TUNNEL, SSHConstants.STATUS.CONNECT, {
                            SSHTunnelConfig: SSHTunnelConfig,
                        })
                        resolve(this.activeTunnels[SSHTunnelConfig.name!])
                    })
                    .on('error', (err: any) => {
                        this.emit(SSHConstants.CHANNEL.TUNNEL, SSHConstants.STATUS.DISCONNECT, {
                            SSHTunnelConfig: SSHTunnelConfig,
                            err: err,
                        })
                        server.close()
                        reject(err)
                        delete this.activeTunnels[SSHTunnelConfig.name!]
                    })
                    .listen(SSHTunnelConfig.localPort)
            })
        }
    }

    /**
     * Close the tunnel
     */
    closeTunnel(name?: string): Promise<void> {
        if (name && this.activeTunnels[name]) {
            return new Promise((resolve) => {
                const tunnel = this.activeTunnels[name]
                this.emit(SSHConstants.CHANNEL.TUNNEL, SSHConstants.STATUS.BEFOREDISCONNECT, {
                    SSHTunnelConfig: tunnel,
                })
                tunnel.server.close(() => {
                    this.emit(SSHConstants.CHANNEL.TUNNEL, SSHConstants.STATUS.DISCONNECT, {
                        SSHTunnelConfig: this.activeTunnels[name],
                    })
                    delete this.activeTunnels[name]
                    resolve()
                })
            })
        } else if (!name) {
            const tunnels = Object.keys(this.activeTunnels).map((key) => this.closeTunnel(key))
            return Promise.all(tunnels).then(() => {})
        }

        return Promise.resolve()
    }
}
