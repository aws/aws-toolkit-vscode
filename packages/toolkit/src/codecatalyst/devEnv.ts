/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { DevEnvironment } from '../shared/clients/codecatalystClient'
import { DevEnvActivity } from '../shared/clients/devenvClient'
import globals from '../shared/extensionGlobals'
import * as vscode from 'vscode'
import { Timeout } from '../shared/utilities/timeoutUtils'
import { showMessageWithCancel } from '../shared/utilities/messages'
import { isCloud9 } from '../shared/extensionUtilities'
import { getLogger } from '../shared/logger'

/** If we should be sending the dev env activity timestamps to track user activity */
export function shouldTrackUserActivity(maxInactivityMinutes: DevEnvironment['inactivityTimeoutMinutes']): boolean {
    // This value is a static value initialized when the dev env is first created.
    //
    // If it is updated, the dev env is restarted and this extension will restarted and grab the latest value.
    // Due to this, we do not need to keep track of this value since the
    //
    // For more info see: https://docs.aws.amazon.com/codecatalyst/latest/APIReference/API_UpdateDevEnvironment.html#codecatalyst-UpdateDevEnvironment-request-inactivityTimeoutMinutes
    return maxInactivityMinutes > 0
}

export class InactivityMessage implements vscode.Disposable {
    #message: Message | undefined
    #nextWholeMinute: NodeJS.Timeout | undefined
    #beforeMessageShown: NodeJS.Timeout | undefined

    /** Indicates to show first message 5 minutes before shutdown */
    static readonly firstMessageBeforeShutdown = 5

    /**
     * Sets up all messages that are displayed to the user when the dev env is inactive and starts to get close to shutdown.
     *
     * @param maxInactivityMinutes The # of minutes a CodeCatalyst Dev Env can be inactive till it shuts down.
     * @param devEnvActivity The DevEnvActivity client
     * @param relativeMinuteMillis How many milliseconds we want a "minute" to be. This is
     *                             useful for testing purposes.
     */
    async setupMessage(
        maxInactivityMinutes: DevEnvironment['inactivityTimeoutMinutes'],
        devEnvActivity: DevEnvActivity,
        relativeMinuteMillis: number = 60_000
    ) {
        devEnvActivity.onActivityUpdate(async latestActivityTimestamp => {
            this._setupMessage(maxInactivityMinutes, latestActivityTimestamp, devEnvActivity, relativeMinuteMillis)
        })

        // Send an initial update to the dev env on startup
        await devEnvActivity.sendActivityUpdate()
    }

    private _setupMessage(
        maxInactivityMinutes: number,
        latestTimestamp: number,
        devEnvActivity: DevEnvActivity,
        relativeMinuteMillis: number
    ) {
        this.clearOldMessage()

        const { millisToWait, minutesSinceTimestamp } = this.millisUntilNextWholeMinute(
            latestTimestamp,
            relativeMinuteMillis
        )
        const minutesUntilShutdown = maxInactivityMinutes - minutesSinceTimestamp
        const minutesUntilFirstMessage = minutesUntilShutdown - InactivityMessage.firstMessageBeforeShutdown

        /** Wait until we are {@link InactivityMessage.firstMessageBeforeShutdown} minutes before shutdown. */
        this.#beforeMessageShown = globals.clock.setTimeout(() => {
            const userIsActive = () => {
                devEnvActivity.sendActivityUpdate().catch(e => {
                    getLogger().error('DevEnvActivity.sendActivityUpdate failed: %s', (e as Error).message)
                })
            }

            const willRefreshOnStaleTimestamp = async () => await devEnvActivity.isLocalActivityStale()

            this.message()
                .show(
                    minutesSinceTimestamp + minutesUntilFirstMessage,
                    minutesUntilShutdown - minutesUntilFirstMessage,
                    userIsActive,
                    willRefreshOnStaleTimestamp,
                    relativeMinuteMillis
                )
                .catch(e => {
                    getLogger().error('Message.show failed: %s', (e as Error).message)
                })
        }, millisToWait + minutesUntilFirstMessage * relativeMinuteMillis)
    }

    private clearOldMessage() {
        if (this.#nextWholeMinute) {
            clearTimeout(this.#nextWholeMinute)
            this.#nextWholeMinute = undefined
        }
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
        relativeMinuteMillis: number
    ): { millisToWait: number; minutesSinceTimestamp: number } {
        const millisSinceLastTimestamp = Date.now() - latestTimestamp
        const millisSinceLastWholeMinute = millisSinceLastTimestamp % relativeMinuteMillis

        const millisToWait = millisSinceLastWholeMinute !== 0 ? relativeMinuteMillis - millisSinceLastWholeMinute : 0
        const minutesSinceTimestamp = (millisSinceLastTimestamp + millisToWait) / relativeMinuteMillis

        return { millisToWait, minutesSinceTimestamp }
    }

    private message() {
        this.clearOldMessage()
        return (this.#message = new Message())
    }

    dispose() {
        this.clearOldMessage()
    }
}

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
     * @param relativeMinuteMillis How many milliseconds we want a "minute" to be. This is
     *                             useful for testing purposes.
     */
    async show(
        minutesUserWasInactive: number,
        minutesUntilShutdown: number,
        userIsActive: () => void,
        willRefreshOnStaleTimestamp: () => Promise<boolean>,
        relativeMinuteMillis: number
    ) {
        this.clearExistingMessage()
        // Show a new message every minute
        this.currentWarningMessageTimeout = new Timeout(1 * relativeMinuteMillis)

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
                    relativeMinuteMillis
                )
            }
        })

        if (isCloud9()) {
            // C9 does not support message with progress, so just show a warning message.
            return vscode.window
                .showWarningMessage(
                    this.buildInactiveWarningMessage(minutesUserWasInactive, minutesUntilShutdown),
                    'Cancel'
                )
                .then(() => {
                    this.currentWarningMessageTimeout!.cancel()
                })
        } else {
            return void showMessageWithCancel(
                this.buildInactiveWarningMessage(minutesUserWasInactive, minutesUntilShutdown),
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

    private buildInactiveWarningMessage(inactiveMinutes: number, remainingMinutes: number) {
        return `Your CodeCatalyst Dev Environment has been inactive for ${inactiveMinutes} minutes, shutting it down in ${remainingMinutes} minutes.`
    }
}
