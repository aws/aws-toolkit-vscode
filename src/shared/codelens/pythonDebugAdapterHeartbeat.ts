/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as net from 'net'
import { getLogger, Logger } from '../logger'

export class PythonDebugAdapterHeartbeat {
    private readonly socket: net.Socket
    private readonly logger: Logger = getLogger()
    public constructor(private readonly port: number) {
        this.socket = new net.Socket()
    }

    public async connect(): Promise<boolean> {
        this.logger.verbose(`Attempting to connect to port ${this.port}`)

        return new Promise<boolean>((resolve, reject) => {
            const timeout = setTimeout(() => {
                // TODO : CC : Cancel this if other exit routes (also same for other timeouts in file)
                this.logger.verbose(`Timeout before connecting to port ${this.port}`)
                // We never got a response yet/at all
                resolve(false)
            }, 1500)

            this.socket.once('connect', () => {
                clearTimeout(timeout)
                this.logger.verbose('Made connection')
                resolve(true)
            })
            this.socket.once('error', (err: Error) => {
                clearTimeout(timeout)
                this.logger.verbose('Error while connecting', err)
                // todo : only interested in ECONNREFUSED
                resolve(false)
            })
            this.socket.connect(this.port)
        })
    }

    public async isDebugServerUp(): Promise<boolean> {
        this.logger.verbose('Checking if Debug Adapter responds')

        return new Promise<boolean>((resolve, reject) => {
            const timeout = setTimeout(() => {
                // We never got a response yet/at all
                this.logger.verbose('Timeout waiting for response from Debug Adapter')
                resolve(false)
            }, 1500)

            // TODO : CC : on / once ?
            this.socket.once('data', data => {
                clearTimeout(timeout)
                this.logger.verbose('Data received from Debug Adapter', data.toString())
                // TODO : check data returned
                resolve(true)
            })

            // TODO : CC : LEFT OFF : We keep hitting error DISCONNECTED here.
            // So, let's connect + disconnect each cycle
            // Consider using this.socket.once('') calls
            this.socket.once('error', (err: Error) => {
                clearTimeout(timeout)
                this.logger.verbose('Error writing to Debug Adapter', err)
                resolve(false)
            })
            const r = this.socket.write('Content-Length: 2\r\n\r\n{}')
            this.logger.verbose(`Data written to Debug Adapter, write result: ${r}`)

            // TODO : custom message
            // socket.write('Content-Length: 41\r\n\r\n', 'ASCII', () => {
            //     socket.write('{"type": "request","command": "christou"}', 'utf-8')
            // })
        })
    }

    public async disconnect(): Promise<void> {
        this.logger.verbose('Destroying socket')
        this.socket.destroy()

        // return new Promise<void>((resolve, reject) => {
        //     this.socket.once('close', data => {
        //         resolve()
        //     })
        //     this.socket.destroy()
        //     // this.socket.end()
        // })
    }
}
