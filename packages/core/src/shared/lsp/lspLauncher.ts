/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Disposable } from 'vscode'
import { LanguageClient } from 'vscode-languageclient/node'
import { getLogger } from '../logger/logger'
import { ToolkitError } from '../errors'

const logger = getLogger('lsp')

export interface LspServerResolver {
    serverExecutable(): Promise<string>
    serverRootDir(): Promise<string>
}

export interface LspInstallationInvalidator {
    invalidateResolvedInstallation(): void | Promise<void>
}

export type LanguageClientFactory = (serverPath: string, serverRootDir: string) => Promise<LanguageClient>

export interface LspLauncherConfig {
    name: string
    resolver: LspServerResolver
    invalidator: LspInstallationInvalidator
    clientFactory: LanguageClientFactory
    onStarted?: (client: LanguageClient) => Promise<void>
}

export class LspLauncher implements Disposable {
    private client?: LanguageClient
    private startPromise?: Promise<LanguageClient>
    private disposed = false
    private readonly config: LspLauncherConfig

    constructor(config: LspLauncherConfig) {
        this.config = config
    }

    async start(): Promise<LanguageClient> {
        if (this.disposed) {
            throw new ToolkitError(`${this.config.name}: cannot start a disposed launcher`, {
                code: 'LspLauncherDisposed',
            })
        }

        if (this.client) {
            return this.client
        }

        if (this.startPromise) {
            return this.startPromise
        }

        this.startPromise = this.doStart()

        try {
            const result = await this.startPromise
            return result
        } finally {
            this.startPromise = undefined
        }
    }

    private async doStart(): Promise<LanguageClient> {
        for (let attempt = 1; attempt <= 2; attempt++) {
            const isFinalAttempt = attempt === 2

            const serverPath = await this.config.resolver.serverExecutable()
            const serverRootDir = await this.config.resolver.serverRootDir()

            logger.info(`${this.config.name}: creating client for server at ${serverPath}`)

            let candidate: LanguageClient | undefined
            try {
                candidate = await this.config.clientFactory(serverPath, serverRootDir)
                await candidate.start()
            } catch (startErr) {
                if (candidate) {
                    await bestEffortStopDispose(candidate, this.config.name)
                }

                if (isFinalAttempt) {
                    throw new ToolkitError(
                        `${this.config.name}: failed to start language server after retry: ${startErr}`,
                        { code: 'LspStartFailed', cause: startErr as Error }
                    )
                }

                logger.warn(`${this.config.name}: process start failed, invalidating and retrying once: ${startErr}`)
                await this.config.invalidator.invalidateResolvedInstallation()
                continue
            }

            if (this.disposed) {
                await bestEffortStopDispose(candidate, this.config.name)
                throw new ToolkitError(`${this.config.name}: launcher disposed during start`, {
                    code: 'LspLauncherDisposed',
                })
            }

            this.client = candidate
            logger.info(`${this.config.name}: language client started successfully`)

            if (this.config.onStarted) {
                try {
                    await this.config.onStarted(candidate)
                } catch (onStartedErr) {
                    logger.warn(`${this.config.name}: onStarted hook failed, cleaning up client: ${onStartedErr}`)
                    await this.cleanupClient()
                    throw onStartedErr
                }
            }

            if (this.disposed) {
                await this.cleanupClient()
                throw new ToolkitError(`${this.config.name}: launcher disposed during start`, {
                    code: 'LspLauncherDisposed',
                })
            }

            return candidate
        }

        throw new ToolkitError(`${this.config.name}: language server start did not complete`, {
            code: 'LspStartFailed',
        })
    }

    private async cleanupClient(): Promise<void> {
        const client = this.client
        this.client = undefined
        if (!client) {
            return
        }

        try {
            await client.stop()
        } catch (err) {
            logger.warn(`${this.config.name}: error stopping client during cleanup: ${err}`)
        }
        try {
            await client.dispose()
        } catch (err) {
            logger.warn(`${this.config.name}: error disposing client during cleanup: ${err}`)
        }
    }

    async stop(): Promise<void> {
        await this.cleanupClient()
    }

    getClient(): LanguageClient | undefined {
        return this.client
    }

    dispose(): void {
        this.disposed = true
        void this.stop()
    }
}

async function bestEffortStopDispose(client: LanguageClient, name: string): Promise<void> {
    try {
        await client.stop()
    } catch (err) {
        logger.warn(`${name}: error stopping failed candidate client: ${err}`)
    }
    try {
        await client.dispose()
    } catch (err) {
        logger.warn(`${name}: error disposing failed candidate client: ${err}`)
    }
}
