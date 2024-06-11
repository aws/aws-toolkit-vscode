/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { DevEnvironment } from '../shared/clients/codecatalystClient'
import { DevEnvActivity, DevEnvClient } from '../shared/clients/devenvClient'
import globals from '../shared/extensionGlobals'
import * as vscode from 'vscode'
import { Timeout, waitUntil } from '../shared/utilities/timeoutUtils'
import { showMessageWithCancel } from '../shared/utilities/messages'
import { isCloud9 } from '../shared/extensionUtilities'
import { getLogger } from '../shared/logger'
import { CodeCatalystAuthenticationProvider } from './auth'
import { getThisDevEnv } from './model'
import { isInDevEnv } from '../shared/vscode/env'
import { shared } from '../shared/utilities/functionUtils'
import { DevSettings } from '../shared/settings'

/** Starts the {@link DevEnvActivity} Hearbeat mechanism. */
export class DevEnvActivityStarter {
    private static _instance: DevEnvActivityStarter | undefined = undefined

    /**
     * Trys to start the {@link DevEnvActivity} heartbeat.
     * This mechanism keeps the Dev Env from timing out.
     */
    public static init(authProvider: CodeCatalystAuthenticationProvider) {
        if (!isInDevEnv()) {
            getLogger().debug('codecatalyst: not in a devenv, skipping DevEnvActivity setup')
            return
        }

        DevEnvActivityStarter._instance ??= new DevEnvActivityStarter(authProvider)
        DevEnvActivityStarter._instance.retryStartActivityHeartbeat().catch(e => {
            getLogger().error('retryStartActivityHeartbeat failed: %s', (e as Error).message)
        })
    }

    private devEnvActivity: DevEnvActivity | undefined = undefined
    private onDidChangeAuth: ReturnType<typeof this.authProvider.onDidChangeActiveConnection>

    protected constructor(private readonly authProvider: CodeCatalystAuthenticationProvider) {
        this.onDidChangeAuth = authProvider.onDidChangeActiveConnection(() => {
            this.tryStartActivityHeartbeat(true).catch(e => {
                getLogger().error('tryStartActivityHeartbeat failed: %s', (e as Error).message)
            })
        })
        globals.context.subscriptions.push(this.onDidChangeAuth)
    }

    /**
     * Keeps executing {@link DevEnvActivityStarter.tryStartActivityHeartbeat} on an interval until it succeeds.
     * After a certain amount of time this will stop retrying.
     */
    private async retryStartActivityHeartbeat() {
        return waitUntil(
            async () => {
                await this.tryStartActivityHeartbeat(false)
                return !!this.devEnvActivity
            },
            { interval: 20_000, timeout: 60_000 * 5 }
        )
    }

    /** Trys to start the Activity Heartbeat mechanism */
    private tryStartActivityHeartbeat = shared(async (reauth: boolean) => {
        if (!!this.devEnvActivity && !reauth) {
            return
        }

        const thisDevenv = (await getThisDevEnv(this.authProvider))?.unwrapOrElse(err => {
            getLogger().warn('codecatalyst: failed to get current devenv: %s', err)
            return undefined
        })

        if (!thisDevenv && reauth) {
            getLogger().warn('codecatalyst: failed to get devenv after reauthenticate attempt')
            return
        } else if (!thisDevenv) {
            const connection = this.authProvider.activeConnection
            if (connection) {
                void vscode.window
                    .showErrorMessage('CodeCatalyst: Reauthenticate your connection.', 'Reauthenticate')
                    .then(async res => {
                        if (res !== 'Reauthenticate') {
                            return
                        }
                        await this.authProvider.auth.reauthenticate(connection)
                    })
            }
            getLogger().warn(
                'codecatalyst: starting DevEnvActivity heartbeat without auth (unknown inactivityTimeoutMinutes)'
            )
        }

        const devenvTimeoutMs = DevSettings.instance.get('devenvTimeoutMs', 0)
        if (devenvTimeoutMs) {
            getLogger().warn('codecatalyst: using devenvTimeoutMs=%d', devenvTimeoutMs)
        }
        // If user is not authenticated, assume 15 minutes.
        const inactivityTimeoutMin =
            devenvTimeoutMs > 0 ? devenvTimeoutMs : thisDevenv?.summary.inactivityTimeoutMinutes ?? 15
        if (!shouldSendActivity(inactivityTimeoutMin)) {
            getLogger().info(
                `codecatalyst: disabling DevEnvActivity heartbeat: configured to never timeout (inactivityTimeoutMinutes=${inactivityTimeoutMin})`
            )
            return
        }

        const devEnvActivity = await DevEnvActivity.create(thisDevenv?.devenvClient ?? DevEnvClient.instance)
        if (!devEnvActivity) {
            getLogger().error('codecatalyst: failed to start DevEnvActivity heartbeat, devenv may timeout')
            return
        }

        if (this.devEnvActivity) {
            // Special case: user authenticated, so reinitialize with the correct `inactivityTimeoutMinutes`.
            this.devEnvActivity.dispose()
        }

        // Everything is good, we can start the activity heartbeat now
        devEnvActivity.setUpdateActivityOnIdeActivity(true)

        // Setup the "shutdown imminent" message. Skip this if we aren't authenticated, because we
        // don't know the actual `inactivityTimeoutMinutes`.
        if (thisDevenv) {
            const inactivityMessage = new InactivityMessage()
            await inactivityMessage?.setupMessage(inactivityTimeoutMin, devEnvActivity)
            globals.context.subscriptions.push(inactivityMessage)
            this.onDidChangeAuth.dispose() // Don't need to wait for reauth now.
            getLogger().debug('codecatalyst: setup InactivityMessage')
        }

        globals.context.subscriptions.push(devEnvActivity)
        this.devEnvActivity = devEnvActivity
    })
}

/**
 * Should we send activity heartbeat?
 *
 * If inactivityTimeoutMinutes=0 then it never expires, so Toolkit doesn't need to send heartbeat.
 */
export function shouldSendActivity(inactivityTimeoutMin: DevEnvironment['inactivityTimeoutMinutes']): boolean {
    // This value is initialized when the dev env is first created. If it is updated, MDE restarts
    // the dev env and this extension will grab the new value on startup.
    // https://docs.aws.amazon.com/codecatalyst/latest/APIReference/API_UpdateDevEnvironment.html#codecatalyst-UpdateDevEnvironment-request-inactivityTimeoutMinutes
    return inactivityTimeoutMin > 0
}

/** Shows a "Dev env will shutdown in x minutes due to inactivity" warning. */
export class InactivityMessage implements vscode.Disposable {
    #message: Message | undefined
    #beforeMessageShown: NodeJS.Timeout | undefined

    /** Show a message this many minutes before auto-shutdown. */
    static readonly shutdownWarningThreshold = 5

    /**
     * Creates a timer which will show warning messsage(s) when the dev env is nearing auto-shutdown because of inactivity.
     *
     * @param maxInactivityMinutes Maximum inactivity allowed before auto-shutdown.
     * @param devEnvActivity DevEnvActivity client
     * @param oneMin Milliseconds in a "minute". Used in tests.
     */
    async setupMessage(
        maxInactivityMinutes: DevEnvironment['inactivityTimeoutMinutes'],
        devEnvActivity: DevEnvActivity,
        oneMin: number = 60_000
    ) {
        // Send an initial update to the dev env on startup
        await devEnvActivity.sendActivityUpdate()

        // Reset (redefine) the timer whenever user is active.
        devEnvActivity.onActivityUpdate(async lastActivity => {
            this.clearOldMessage()

            const { millisToWait, minutesSinceTimestamp } = this.millisUntilNextWholeMinute(lastActivity, oneMin)
            const minutesUntilShutdown = maxInactivityMinutes - minutesSinceTimestamp
            const minutesUntilFirstMessage = Math.max(
                0,
                minutesUntilShutdown - InactivityMessage.shutdownWarningThreshold
            )
            const timerInterval = millisToWait + minutesUntilFirstMessage * oneMin
            getLogger().debug(
                'InactivityMessage: millisToWait=%d minutesUntilFirstMessage=%d oneMin=%d',
                millisToWait,
                minutesUntilFirstMessage,
                oneMin
            )

            /** Wait until we are {@link InactivityMessage.shutdownWarningThreshold} minutes before shutdown. */
            this.#beforeMessageShown = globals.clock.setTimeout(() => {
                const userIsActive = () => {
                    devEnvActivity.sendActivityUpdate().catch(e => {
                        getLogger().error('DevEnvActivity.sendActivityUpdate failed: %s', (e as Error).message)
                    })
                }

                const willRefreshOnStaleTimestamp = async () => await devEnvActivity.isLocalActivityStale()

                this.clearOldMessage()
                this.#message?.clearExistingMessage()
                this.#message = new Message()
                this.#message
                    .show(
                        Math.max(0, minutesSinceTimestamp + minutesUntilFirstMessage),
                        Math.max(0, minutesUntilShutdown - minutesUntilFirstMessage),
                        userIsActive,
                        willRefreshOnStaleTimestamp,
                        oneMin
                    )
                    .catch(e => {
                        getLogger().error('Message.show failed: %s', (e as Error).message)
                    })
            }, timerInterval)
            getLogger().debug('InactivityMessage: created message timer for %d ms', timerInterval)
        })
    }

    private clearOldMessage() {
        if (this.#beforeMessageShown) {
            clearTimeout(this.#beforeMessageShown)
            this.#beforeMessageShown = undefined
        }
        if (this.#message) {
            this.#message.dispose()
            this.#message = undefined
        }
    }

    /**
     * The latest activity timestamp may not always be the current time, it may be from the past.
     * So the amount of time that has passed since that timestamp may not be a whole minute.
     *
     * This returns the amount of time we need to wait until the next whole minute, along with how many
     * minutes would have passed assuming the caller waitied until the next minute.
     *
     * Eg:
     *   - 1 minute and 29 seconds have passed since the given timestamp.
     *   - returns { millisToWait: 31_000, minutesSinceTimestamp: 2}
     */
    private millisUntilNextWholeMinute(
        latestTimestamp: number,
        oneMin: number
    ): { millisToWait: number; minutesSinceTimestamp: number } {
        const millisSinceLastTimestamp = Date.now() - latestTimestamp
        const millisSinceLastWholeMinute = millisSinceLastTimestamp % oneMin

        const millisToWait = millisSinceLastWholeMinute !== 0 ? oneMin - millisSinceLastWholeMinute : 0
        const minutesSinceTimestamp = (millisSinceLastTimestamp + millisToWait) / oneMin

        return { millisToWait, minutesSinceTimestamp }
    }

    dispose() {
        this.clearOldMessage()
    }
}

/** Shows a "Dev env will shutdown in x minutes due to inactivity" warning. */
class Message implements vscode.Disposable {
    private currentWarningMessageTimeout: Timeout | undefined

    /**
     * Show the warning message
     *
     * @param minutesUserWasInactive total minutes user was inactive.
     * @param minutesUntilShutdown remaining minutes until shutdown.
     * @param userIsActive Call this to signal that user is active.
     * @param willRefreshOnStaleTimestamp sanity checks with the dev env api that the latest activity timestamp
     *                                    is the same as what this client has locally. If stale, the warning message
     *                                    will be refreshed asynchronously. Returns true if the message will be refreshed.
     * @param oneMin Milliseconds in a "minute". Used in tests.
     */
    async show(
        minutesUserWasInactive: number,
        minutesUntilShutdown: number,
        userIsActive: () => void,
        willRefreshOnStaleTimestamp: () => Promise<boolean>,
        oneMin: number
    ) {
        this.clearExistingMessage()
        // Show a new message every minute
        this.currentWarningMessageTimeout = new Timeout(1 * oneMin)

        if (await willRefreshOnStaleTimestamp()) {
            return
        }

        if (minutesUntilShutdown <= 1) {
            // Recursive base case, with only 1 minute left we do not want to show warning messages anymore,
            // since we will show a shutdown message instead.
            this.clearExistingMessage()

            const imHere = `I'm here!`
            return vscode.window
                .showWarningMessage(
                    `Your CodeCatalyst Dev Environment has been inactive for ${minutesUserWasInactive} minutes, and will stop soon.`,
                    { modal: true },
                    imHere
                )
                .then(res => {
                    if (res === imHere) {
                        userIsActive()
                    }
                })
        }

        this.currentWarningMessageTimeout.token.onCancellationRequested(c => {
            if (c.agent === 'user') {
                // User clicked the 'Cancel' button, indicate they are active.
                userIsActive()
            } else {
                // The message timed out, show the updated message.
                void this.show(
                    minutesUserWasInactive + 1,
                    minutesUntilShutdown - 1,
                    userIsActive,
                    willRefreshOnStaleTimestamp,
                    oneMin
                )
            }
        })

        if (isCloud9()) {
            // C9 does not support message with progress, so just show a warning message.
            return vscode.window
                .showWarningMessage(this.getMessage(minutesUserWasInactive, minutesUntilShutdown), 'Cancel')
                .then(() => {
                    this.currentWarningMessageTimeout!.cancel()
                })
        } else {
            // Show cancellable "progress" message.
            return void showMessageWithCancel(
                this.getMessage(minutesUserWasInactive, minutesUntilShutdown),
                this.currentWarningMessageTimeout
            )
        }
    }

    clearExistingMessage() {
        if (this.currentWarningMessageTimeout) {
            this.currentWarningMessageTimeout.dispose()
            this.currentWarningMessageTimeout = undefined
        }
    }

    dispose() {
        this.clearExistingMessage()
    }

    private getMessage(inactiveMinutes: number, remainingMinutes: number) {
        return `Your CodeCatalyst Dev Environment has been inactive for ${inactiveMinutes} minutes, shutting it down in ${remainingMinutes} minutes.`
    }
}
