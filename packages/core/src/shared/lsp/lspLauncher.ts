/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Disposable } from 'vscode'
import { LanguageClient } from 'vscode-languageclient/node'
import { getLogger } from '../logger/logger'
import { ToolkitError } from '../errors'

const logger = getLogger('lsp')

/**
 * Minimal interface for resolving an LSP server's executable path.
 */
export interface LspServerResolver {
    serverExecutable(): Promise<string>
    serverRootDir(): Promise<string>
}

/**
 * Minimal interface for invalidating a resolved LSP installation.
 * Typically implemented by BaseLspInstaller or a remote provider wrapper.
 * May return a Promise when invalidation requires async cleanup (e.g. deleting files).
 */
export interface LspInstallationInvalidator {
    invalidateResolvedInstallation(): void | Promise<void>
}

/**
 * Factory that creates a LanguageClient given a server executable path.
 * The launcher calls this to build the client before starting it.
 */
export type LanguageClientFactory = (serverPath: string, serverRootDir: string) => Promise<LanguageClient>

export interface LspLauncherConfig {
    /** Display name for logging. */
    name: string
    /** Resolves server path and root dir. */
    resolver: LspServerResolver
    /** Called to invalidate a resolved installation when restart is needed. */
    invalidator: LspInstallationInvalidator
    /** Factory that creates a LanguageClient from server path. */
    clientFactory: LanguageClientFactory
    /** Called after client.start() succeeds. Optional post-start hook. */
    onStarted?: (client: LanguageClient) => Promise<void>
}

/**
 * Generic shared LspLauncher.
 *
 * - Deduplicates concurrent start() calls (only one in-flight at a time)
 * - Returns existing running client on subsequent start() calls
 * - Starts LanguageClient via clientFactory
 * - If start() rejects, cleans up client, invalidates the resolved install,
 *   reruns invalidation/resolver, and retries start exactly once
 * - Exposes stop() and dispose() for lifecycle management
 */
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
        try {
            return await this.attemptStart()
        } catch (firstErr) {
            logger.warn(`${this.config.name}: first start attempt failed, retrying after invalidation: ${firstErr}`)
            await this.config.invalidator.invalidateResolvedInstallation()

            try {
                return await this.attemptStart()
            } catch (retryErr) {
                throw new ToolkitError(
                    `${this.config.name}: failed to start language server after retry: ${retryErr}`,
                    { code: 'LspStartFailed', cause: retryErr as Error }
                )
            }
        }
    }

    private async attemptStart(): Promise<LanguageClient> {
        const serverPath = await this.config.resolver.serverExecutable()
        const serverRootDir = await this.config.resolver.serverRootDir()

        logger.info(`${this.config.name}: creating client for server at ${serverPath}`)
        const candidate = await this.config.clientFactory(serverPath, serverRootDir)

        try {
            await candidate.start()
        } catch (startErr) {
            try {
                await candidate.stop()
            } catch {
                // ignore stop errors during cleanup
            }
            try {
                await candidate.dispose()
            } catch {
                // ignore dispose errors during cleanup
            }
            throw startErr
        }

        // Client started successfully
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

        return candidate
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

    /**
     * Stop the running language client.
     */
    async stop(): Promise<void> {
        await this.cleanupClient()
    }

    /**
     * Returns the current LanguageClient if started, or undefined.
     */
    getClient(): LanguageClient | undefined {
        return this.client
    }

    dispose(): void {
        this.disposed = true
        void this.stop()
    }
}
