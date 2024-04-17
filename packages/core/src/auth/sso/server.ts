/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import http from 'http'
import { getLogger } from '../../shared/logger'
import { ToolkitError } from '../../shared/errors'
import { Socket } from 'net'
import globals from '../../shared/extensionGlobals'
import { Result } from '../../shared/utilities/result'

export class MissingPortError extends ToolkitError {
    constructor() {
        super('AuthSSOServer: missing auth server port', { code: 'MissingPort' })
    }
}

export class MissingCodeError extends ToolkitError {
    constructor() {
        super('AuthSSOServer: missing code', { code: 'MissingCode' })
    }
}

export class MissingStateError extends ToolkitError {
    constructor() {
        super('AuthSSOServer: missing state', { code: 'MissingState' })
    }
}

export class InvalidStateError extends ToolkitError {
    constructor() {
        super('AuthSSOServer: invalid state', { code: 'InvalidState' })
    }
}

export class AuthError extends ToolkitError {
    constructor(error: string, errorDescription: string) {
        super(`AuthSSOServer: ${error}: ${errorDescription}`, { code: 'AuthRedirectError' })
    }
}

/**
 * Server responsible for taking redirect requests from auth and redirecting them
 * back to VSCode
 */
export class AuthSSOServer {
    public baseUrl = `http://127.0.0.1`
    private oauthCallback = '/'
    private authenticationFlowTimeoutInMs = 600000
    private authenticationWarningTimeoutInMs = 60000

    private readonly authenticationPromise: Promise<Result<string>>
    private deferred: { resolve: (result: Result<string>) => void } | undefined
    private server: http.Server
    private connections: Socket[]

    constructor(private readonly state: string, private readonly vscodeUriPath: string) {
        this.authenticationPromise = new Promise<Result<string>>(resolve => {
            this.deferred = { resolve }
        })

        this.connections = []

        this.server = http.createServer((req, res) => {
            res.setHeader('Access-Control-Allow-Methods', 'GET')

            if (!req.url) {
                return
            }

            const url = new URL(req.url, this.baseUrl)
            switch (url.pathname) {
                case this.oauthCallback: {
                    this.handleAuthentication(url.searchParams, res)
                    break
                }
                default: {
                    getLogger().info('AuthSSOServer: missing redirection path name')
                }
            }
        })

        this.server.on('connection', connection => {
            this.connections.push(connection)
        })
    }

    start() {
        if (this.server.listening) {
            throw new ToolkitError('AuthSSOServer: Server already started')
        }

        return new Promise<void>((resolve, reject) => {
            this.server.on('close', () => {
                reject(new ToolkitError('AuthSSOServer: Server has closed'))
            })

            this.server.on('error', error => {
                reject(new ToolkitError(`AuthSSOServer: Server failed: ${error}`))
            })

            this.server.on('listening', () => {
                if (!this.server.address()) {
                    reject(new MissingPortError())
                }

                resolve()
            })

            this.server.listen(0, '127.0.0.1')
        })
    }

    close() {
        return new Promise<void>((resolve, reject) => {
            if (!this.server.listening) {
                reject(new ToolkitError('AuthSSOServer: Server not started'))
            }

            this.connections.forEach(connection => {
                connection.destroy()
            })

            this.server.close(err => {
                if (err) {
                    reject(err)
                }
                resolve()
            })
        })
    }

    public get redirectUri(): string {
        return `${this.baseUrl}:${this.getPort()}`
    }

    public getAddress() {
        return this.server.address()
    }

    private getPort(): number {
        const addr = this.getAddress()
        if (addr instanceof Object) {
            return addr.port
        } else if (typeof addr === 'string') {
            return parseInt(addr)
        } else {
            throw new MissingPortError()
        }
    }

    private handleAuthentication(params: URLSearchParams, res: http.ServerResponse) {
        const error = params.get('error')
        const errorDescription = params.get('error_description')
        if (error && errorDescription) {
            this.handleRequestRejection(res, new AuthError(error, errorDescription))
            return
        }

        const code = params.get('code')
        if (!code) {
            this.handleRequestRejection(res, new MissingCodeError())
            return
        }

        const state = params.get('state')
        if (!state) {
            this.handleRequestRejection(res, new MissingStateError())
            return
        }

        if (state !== this.state) {
            this.handleRequestRejection(res, new InvalidStateError())
            return
        }

        this.deferred?.resolve(Result.ok(code))
        res.setHeader('Content-Type', 'text/html')
        res.writeHead(200)
        res.end(`
            <html>
                <body>
                    <p>Authenticated successfully. You may now close this window.</p>
                    <script>
                        window.location.replace('${this.vscodeUriPath}')
                    </script>
                </body>
            </html>`)
    }

    private handleRequestRejection(res: http.ServerResponse, error: ToolkitError) {
        // Notify the user
        res.writeHead(400)
        res.end(error.message)

        // Send the response back to the editor
        this.deferred?.resolve(Result.err(error))
    }

    public waitForAuthorization(): Promise<Result<string>> {
        return Promise.race([
            this.authenticationPromise,
            new Promise<Result<string>>((_, reject) => {
                globals.clock.setTimeout(() => {
                    reject(
                        new ToolkitError('Timed-out waiting for browser login flow to complete', {
                            code: 'TimedOut',
                        })
                    )
                }, this.authenticationFlowTimeoutInMs)

                const warningTimeout = globals.clock.setTimeout(() => {
                    getLogger().warn('AuthSSOServer: Authentication is taking a long time')
                }, this.authenticationWarningTimeoutInMs)

                void this.authenticationPromise.then(() => {
                    clearTimeout(warningTimeout)
                })
            }),
        ])
    }
}
