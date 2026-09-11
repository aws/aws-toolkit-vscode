/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { CloseAction, ErrorAction, ErrorHandler, Message } from 'vscode-languageclient/node'
import { getLogger } from '../logger/logger'
import { ToolkitError } from '../errors'

const logger = getLogger('lsp')

/** Hooks a language server integration can supply; all are optional. */
export interface LspServerLifecycleHooks {
    /**
     * Decides whether a `startProcess` failure is eligible for the single invalidate-and-retry repair.
     * Defaults to repairing every failure. Return `false` for errors that a reinstall cannot fix.
     */
    shouldRepair?: (err: unknown) => boolean
    /**
     * The connection closed unexpectedly *after* `initialize` completed. This is not an installation
     * problem, so no repair is attempted and the server is not restarted automatically; use this to
     * inform the user or offer a restart.
     */
    onServerStopped?: () => void
    /** A protocol/transport error was reported while the server was running. The client keeps going. */
    onError?: (error: Error, message: Message | undefined, count: number | undefined) => void
}

export interface LspServerLifecycleConfig<T, R = void> extends LspServerLifecycleHooks {
    /** Presentable name used in log and error messages. */
    name: string
    /**
     * Locates the server, installing it if necessary, and returns what {@link startProcess} needs.
     * Runs before every start attempt so a repair re-resolves (and re-downloads) the server.
     * Failures are installation problems that a reinstall cannot fix, so they are never repaired and
     * propagate unchanged — the structural equivalent of JetBrains' `shouldRepair = { it !is LspInstallException }`.
     */
    resolveServer: () => Promise<R>
    /**
     * Spawns the server and completes the LSP `initialize` handshake, returning the running client.
     * Must reject if either step fails; on rejection any partially created client must already be
     * cleaned up by the callee.
     */
    startProcess: (server: R) => Promise<T>
    /** Removes the resolved installation so the retry re-resolves (and re-downloads) the server. */
    invalidateAndReinstall: () => void | Promise<void>
}

/**
 * Reusable startup-recovery policy for managed language servers, the VS Code counterpart of the
 * JetBrains toolkit's `LspServerLifecycleController`:
 *
 * - {@link launchWithRetry}: a process-start failure invalidates the installation and retries exactly
 *   once. A second failure surfaces as `LspStartFailed` with the underlying error as `cause`.
 * - {@link createErrorHandler}: the `vscode-languageclient` error policy — errors continue, an
 *   unexpected close does not auto-restart (a restart is the user's decision), and a post-initialize
 *   close is reported through {@link LspServerLifecycleHooks.onServerStopped}.
 *
 * Unlike IntelliJ, where the process handle is returned before `initialize` and a pre-initialize crash is
 * a separate "server stopped" event, `LanguageClient.start()` spans the `initialize` handshake. A server
 * that dies before initializing therefore rejects `startProcess()` and is repaired by the same single retry;
 * {@link onServerStopped} deliberately does nothing for that case so the repair budget is not spent twice.
 *
 * Integrations should not implement this policy themselves; compose this class (see `LspLauncher`).
 */
export class LspServerLifecycleController<T, R = void> {
    private initialized = false

    constructor(private readonly config: LspServerLifecycleConfig<T, R>) {}

    /** Whether the server completed `initialize` in the current session. */
    isInitialized(): boolean {
        return this.initialized
    }

    /**
     * Resolves and starts the server, repairing the installation and retrying once if the *process*
     * fails to start. Resolution/installation errors propagate unchanged, as do process errors that
     * {@link LspServerLifecycleHooks.shouldRepair} rejects.
     *
     * @param beforeAttempt Optional guard run before each attempt (e.g. to abort when disposed); a throw aborts the launch.
     */
    async launchWithRetry(beforeAttempt?: () => void): Promise<T> {
        this.initialized = false
        const { name } = this.config

        beforeAttempt?.()
        const firstServer = await this.config.resolveServer()
        try {
            return await this.config.startProcess(firstServer)
        } catch (firstErr) {
            if (!(this.config.shouldRepair?.(firstErr) ?? true)) {
                logger.info(`${name}: process start failure not eligible for repair, rethrowing: ${firstErr}`)
                throw firstErr
            }

            logger.warn(`${name}: process start failed, invalidating and retrying once: ${firstErr}`)
            await this.config.invalidateAndReinstall()

            beforeAttempt?.()
            const server = await this.config.resolveServer()
            try {
                return await this.config.startProcess(server)
            } catch (secondErr) {
                throw new ToolkitError(`${name}: failed to start language server after retry: ${secondErr}`, {
                    code: 'LspStartFailed',
                    cause: secondErr instanceof Error ? secondErr : undefined,
                })
            }
        }
    }

    /** Call once the client is running (after `initialize`). */
    onInitialized(): void {
        this.initialized = true
    }

    /**
     * Call when the server connection closes. `shutdownNormally` is true when the close was requested
     * by us (stop/dispose); the `ErrorHandler` from {@link createErrorHandler} reports unexpected closes.
     */
    onServerStopped(shutdownNormally: boolean): void {
        const { name } = this.config
        if (shutdownNormally) {
            this.initialized = false
            return
        }

        if (this.initialized) {
            logger.info(`${name}: server stopped after initialization — not an installation problem`)
            this.initialized = false
            this.config.onServerStopped?.()
            return
        }

        // Pre-initialize stop: the in-flight launchWithRetry() observes this as a start failure and
        // performs the single repair, so there is nothing further to do here.
        logger.info(`${name}: server stopped before initialization; the pending launch handles the repair`)
    }

    /**
     * `LanguageClientOptions.errorHandler` implementing the shared policy. Pass this to every
     * `LanguageClient` created for the server so integrations do not re-implement close/error handling.
     */
    createErrorHandler(): ErrorHandler {
        return {
            error: (error, message, count) => {
                this.config.onError?.(error, message, count)
                return { action: ErrorAction.Continue }
            },
            closed: () => {
                this.onServerStopped(false)
                return { action: CloseAction.DoNotRestart }
            },
        }
    }
}
