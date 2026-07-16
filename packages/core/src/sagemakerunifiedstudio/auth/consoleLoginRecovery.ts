/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as os from 'os'
import * as path from 'path'
import { getLogger } from '../../shared/logger/logger'
import fs from '../../shared/fs/fs'
import { SmusAuthenticationProvider } from './providers/smusAuthenticationProvider'
import { telemetry } from '../../shared/telemetry/telemetry'

const logger = getLogger('smus')

/**
 * Reload-and-resume workaround for the console-login stale-token cache bug.
 *
 * The AWS SDK caches the login token file in a module-level cache for the life of the
 * extension host process. If that cache was primed with an expired token (startup restore),
 * a fresh `aws login` writes a new token to disk but the SDK keeps serving the stale copy,
 * so sign-in fails even though it should have succeeded. A window reload starts a fresh
 * process (empty cache), and a persisted marker lets us resume the sign-in automatically so
 * the user doesn't have to re-drive the flow.
 */

const pendingSignInKey = 'smus.pendingSignIn'

/** How recently a console login must have succeeded for detection to trigger. */
const recentLoginWindowMs = 5 * 60 * 1000

/** Persisted intent to resume an IAM console sign-in after a window reload. */
export interface PendingSignIn {
    profileName: string
    region: string
    /** Loop-guard: set to true before the resume attempt runs, so we never retry twice. */
    attempted: boolean
}

let lastConsoleLoginSuccessAt: number | undefined

/**
 * Records that `aws login` just completed successfully (CLI exit 0).
 * Called from tryConsoleLogin. This is detection signal A: the disk token is known-fresh.
 */
export function recordConsoleLoginSuccess(): void {
    lastConsoleLoginSuccessAt = Date.now()
}

function wasRecentConsoleLogin(): boolean {
    return lastConsoleLoginSuccessAt !== undefined && Date.now() - lastConsoleLoginSuccessAt <= recentLoginWindowMs
}

/**
 * Detection signal B: inspect `~/.aws/login/cache/` and return true if any cached login
 * token is still valid (accessToken.expiresAt in the future). If the disk token is fresh
 * but credential resolution failed with a token error, the failure came from the SDK's
 * stale in-memory copy.
 *
 * Returns false on any read/parse problem.
 */
export async function isLoginTokenFreshOnDisk(): Promise<boolean> {
    const cacheDir = process.env.AWS_LOGIN_CACHE_DIRECTORY ?? path.join(os.homedir(), '.aws', 'login', 'cache')
    try {
        const entries = await fs.readdir(cacheDir)
        for (const [name, type] of entries) {
            if (type !== vscode.FileType.File || !name.endsWith('.json')) {
                continue
            }
            try {
                const content = await fs.readFileText(path.join(cacheDir, name))
                const parsed = JSON.parse(content)
                const expiresAt = parsed?.accessToken?.expiresAt
                if (typeof expiresAt === 'string' && new Date(expiresAt).getTime() > Date.now()) {
                    return true
                }
            } catch (e) {
                logger.debug(`consoleLoginRecovery: failed to parse ${name}: ${(e as Error).message}`)
            }
        }
    } catch (e) {
        logger.debug(`consoleLoginRecovery: failed to read login cache dir: ${(e as Error).message}`)
    }
    return false
}

/**
 * Returns true if the error (or its cause chain) looks like a login token/refresh failure.
 * Deliberately loose: the strong signals are the recent CLI success and the fresh disk token.
 */
function isTokenRefreshError(error: unknown): boolean {
    const messages: string[] = []
    let current: unknown = error
    // Walk the cause chain (ToolkitError and plain Error both may have .cause)
    for (let depth = 0; depth < 5 && current instanceof Error; depth++) {
        messages.push(current.message)
        current = (current as Error & { cause?: unknown }).cause
    }
    const combined = messages.join(' | ')
    return (
        combined.includes('Failed to refresh token') ||
        combined.includes('Your session has expired') ||
        combined.includes('invalid, expired, revoked') ||
        combined.includes('Console credentials error')
    )
}

/**
 * Returns true if a sign-in failure has the poisoned-cache signature:
 * a console login just succeeded (disk token fresh, confirmed by inspection), yet
 * credential resolution failed with a token/refresh error. Both can only be true at once
 * if the SDK served a stale in-memory token.
 *
 * @param error the failure — an Error, or an error message string (validateIamProfile
 *   returns its failure as a string rather than throwing)
 */
export async function detectPoisonedCache(error: unknown): Promise<boolean> {
    if (!wasRecentConsoleLogin()) {
        return false
    }
    const isTokenError = typeof error === 'string' ? isTokenRefreshError(new Error(error)) : isTokenRefreshError(error)
    if (!isTokenError) {
        return false
    }
    return isLoginTokenFreshOnDisk()
}

/**
 * Persists the resume marker and reloads the window (after user confirmation).
 * On the next activation, {@link tryResumePendingSignIn} picks up the marker and re-drives
 * the sign-in for the same profile/region against the now-fresh disk token.
 *
 * @returns true if the reload was initiated, false if the user declined
 */
export async function promptReloadAndResume(
    memento: vscode.Memento,
    profileName: string,
    region: string
): Promise<boolean> {
    const reload = 'Reload'
    const response = await vscode.window.showInformationMessage(
        `Sign-in for profile "${profileName}" needs a window reload to complete. Save your work before continuing. Reload now?`,
        { modal: true },
        reload
    )
    if (response !== reload) {
        return false
    }

    const pending: PendingSignIn = { profileName, region, attempted: false }
    await memento.update(pendingSignInKey, pending)
    logger.info(`consoleLoginRecovery: reloading window to recover stale credentials for profile ${profileName}`)
    await vscode.commands.executeCommand('workbench.action.reloadWindow')
    return true
}

/**
 * Called once on SMUS activation (after restore). If a pending sign-in marker exists,
 * resumes the IAM sign-in for the saved profile/region, skipping the wizard.
 *
 * Loop-guard: the marker is stamped `attempted: true` (persisted) BEFORE the resume runs,
 * so a failing resume can never trigger a second reload. A marker that is already
 * `attempted` is cleared and ignored.
 */
export async function tryResumePendingSignIn(
    context: vscode.ExtensionContext,
    authProvider: SmusAuthenticationProvider
): Promise<void> {
    const memento = context.globalState
    const pending = memento.get<PendingSignIn>(pendingSignInKey)
    if (!pending?.profileName || !pending.region) {
        return
    }

    if (pending.attempted) {
        // The previous resume attempt did not complete successfully — do not loop.
        logger.warn('consoleLoginRecovery: previous resume attempt did not succeed; clearing marker')
        await memento.update(pendingSignInKey, undefined)
        void vscode.window.showErrorMessage(
            `Couldn't restore your SageMaker Unified Studio sign-in for profile "${pending.profileName}". Please sign in again.`
        )
        return
    }

    // Stamp the loop-guard before doing anything that can fail, so a crash or another
    // reload mid-attempt can never lead to a second automatic attempt.
    await memento.update(pendingSignInKey, { ...pending, attempted: true })

    logger.info(`consoleLoginRecovery: resuming sign-in for profile ${pending.profileName} after reload`)
    try {
        await telemetry.smus_login.run(async (span) => {
            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: 'Reconnecting to SageMaker Unified Studio...',
                },
                async () => {
                    // Dynamic import to avoid a static import cycle with the orchestrator.
                    const { SmusAuthenticationOrchestrator } = await import('./authenticationOrchestrator.js')
                    const result = await SmusAuthenticationOrchestrator.handleIamAuthentication(
                        authProvider,
                        span,
                        context,
                        pending.profileName,
                        pending.region
                    )
                    logger.info(`consoleLoginRecovery: resume finished with status ${result.status}`)
                }
            )
        })
    } catch (e) {
        logger.error(`consoleLoginRecovery: resume failed: %O`, e)
        void vscode.window.showErrorMessage(
            `Couldn't restore your SageMaker Unified Studio sign-in for profile "${pending.profileName}". Please sign in again.`
        )
    } finally {
        await memento.update(pendingSignInKey, undefined)
    }
}
