/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Disposable } from 'vscode'
import { ErrorHandler, LanguageClient } from 'vscode-languageclient/node'
import { getLogger } from '../logger/logger'
import { ToolkitError } from '../errors'
import { LspServerLifecycleController, LspServerLifecycleHooks } from './lspServerLifecycle'

const logger = getLogger('lsp')

export interface LspServerResolver {
    serverExecutable(): Promise<string>
    serverRootDir(): Promise<string>
}

export interface LspInstallationInvalidator {
    invalidateResolvedInstallation(): void | Promise<void>
}

/** What the launcher hands to the client factory; `errorHandler` must be set on `LanguageClientOptions`. */
export interface LanguageClientFactoryContext {
    serverPath: string
    serverRootDir: string
    /** Shared close/error policy from {@link LspServerLifecycleController}; do not implement your own. */
    errorHandler: ErrorHandler
}

export type LanguageClientFactory = (context: LanguageClientFactoryContext) => Promise<LanguageClient>

export interface LspLauncherConfig extends LspServerLifecycleHooks {
    name: string
    resolver: LspServerResolver
    invalidator: LspInstallationInvalidator
    clientFactory: LanguageClientFactory
    onStarted?: (client: LanguageClient) => Promise<void>
}

interface ResolvedServer {
    serverPath: string
    serverRootDir: string
}

/**
 * Starts a managed language server: resolves (installing if needed), creates the client, and runs the
 * shared startup-recovery policy from {@link LspServerLifecycleController}. Owns the running client for
 * the session; `stop()`/`dispose()` shut it down.
 */
export class LspLauncher implements Disposable {
    private client?: LanguageClient
    private startPromise?: Promise<LanguageClient>
    private disposed = false
    private readonly config: LspLauncherConfig
    private readonly lifecycle: LspServerLifecycleController<LanguageClient, ResolvedServer>

    constructor(config: LspLauncherConfig) {
        this.config = config
        this.lifecycle = new LspServerLifecycleController<LanguageClient, ResolvedServer>({
            name: config.name,
            resolveServer: () => this.resolveServer(),
            startProcess: (server) => this.startProcess(server),
            invalidateAndReinstall: () => config.invalidator.invalidateResolvedInstallation(),
            shouldRepair: config.shouldRepair,
            onServerStopped: config.onServerStopped,
            onError: config.onError,
        })
    }

    async start(): Promise<LanguageClient> {
        if (this.disposed) {
            throw this.disposedError('cannot start a disposed launcher')
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

    private async resolveServer(): Promise<ResolvedServer> {
        const serverPath = await this.config.resolver.serverExecutable()
        const serverRootDir = await this.config.resolver.serverRootDir()
        return { serverPath, serverRootDir }
    }

    /** Creates the client and completes `initialize`; a partially created client is cleaned up on failure. */
    private async startProcess({ serverPath, serverRootDir }: ResolvedServer): Promise<LanguageClient> {
        logger.info(`${this.config.name}: creating client for server at ${serverPath}`)
        let candidate: LanguageClient | undefined
        try {
            candidate = await this.config.clientFactory({
                serverPath,
                serverRootDir,
                errorHandler: this.lifecycle.createErrorHandler(),
            })
            await candidate.start()
            return candidate
        } catch (err) {
            if (candidate) {
                await bestEffortStopDispose(candidate, this.config.name)
            }
            throw err
        }
    }

    private async doStart(): Promise<LanguageClient> {
        // Resolving may download the server; don't start that work if we were disposed during the
        // previous attempt (e.g. a restart or deactivation raced with the invalidate-and-retry).
        const candidate = await this.lifecycle.launchWithRetry(() => {
            if (this.disposed) {
                throw this.disposedError('launcher disposed during start')
            }
        })

        if (this.disposed) {
            await bestEffortStopDispose(candidate, this.config.name)
            throw this.disposedError('launcher disposed during start')
        }

        this.client = candidate
        this.lifecycle.onInitialized()
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
            throw this.disposedError('launcher disposed during start')
        }

        return candidate
    }

    private disposedError(message: string): ToolkitError {
        return new ToolkitError(`${this.config.name}: ${message}`, { code: 'LspLauncherDisposed' })
    }

    private async cleanupClient(): Promise<void> {
        const client = this.client
        this.client = undefined
        if (!client) {
            return
        }

        // We initiated this stop, so the ErrorHandler will not see it; tell the lifecycle directly.
        this.lifecycle.onServerStopped(true)
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
