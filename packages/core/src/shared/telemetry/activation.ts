/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from '../extensionGlobals'

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import { AwsContext } from '../awsContext'
import { DefaultTelemetryService } from './telemetryService'
import { getLogger } from '../logger'
import { getComputeRegion, getIdeProperties, isCloud9 } from '../extensionUtilities'
import { openSettings, Settings, TelemetryIdSettings } from '../settings'
import { TelemetryConfig } from './util'
import { isAutomation, isReleaseVersion } from '../vscode/env'
import { randomUUID } from 'crypto'
import { VSCODE_EXTENSION_ID } from '../utilities'

export const noticeResponseViewSettings = localize('AWS.telemetry.notificationViewSettings', 'Settings')
export const noticeResponseOk = localize('AWS.telemetry.notificationOk', 'OK')

// eslint-disable-next-line @typescript-eslint/naming-convention
export const TELEMETRY_NOTICE_VERSION_ACKNOWLEDGED = 'awsTelemetryNoticeVersionAck'

// Telemetry Notice Versions
// Versioning the users' notice acknowledgement is forward looking, and allows us to better
// track scenarios when we may need to re-prompt the user about telemetry.
// Version 1 was the original notice, allowing users to enable/disable/defer telemetry
// Version 2 states that there is metrics gathering, which can be adjusted in the options
const CURRENT_TELEMETRY_NOTICE_VERSION = 2 // eslint-disable-line @typescript-eslint/naming-convention

const telemetryClientIdKey = 'aws.telemetry.clientId'
/**
 * Sets up the Metrics system and initializes globals.telemetry
 */
export async function activate(extensionContext: vscode.ExtensionContext, awsContext: AwsContext, settings: Settings) {
    const config = new TelemetryConfig(settings)
    globals.telemetry = await DefaultTelemetryService.create(extensionContext, awsContext, getComputeRegion())
    try {
        globals.telemetry.telemetryEnabled = config.isEnabled()

        extensionContext.subscriptions.push(
            config.onDidChange(event => {
                if (event.key === 'telemetry') {
                    globals.telemetry.telemetryEnabled = config.isEnabled()
                }
            })
        )

        // Prompt user about telemetry if they haven't been
        if (!isCloud9() && !hasUserSeenTelemetryNotice(extensionContext)) {
            showTelemetryNotice(extensionContext)
        }

        await globals.telemetry.start()
        await setupTelemetryClientId(extensionContext.extension.id)
    } catch (e) {
        // Only throw in a production build because:
        //   1. Telemetry must never prevent normal Toolkit operation.
        //   2. We want to know if something is not working ASAP during development.
        if (isAutomation() || !isReleaseVersion()) {
            throw e
        }

        getLogger().error(`telemetry: failed to activate: %s`, e)
    }
}

export function hasUserSeenTelemetryNotice(extensionContext: vscode.ExtensionContext): boolean {
    return (
        extensionContext.globalState.get<number>(TELEMETRY_NOTICE_VERSION_ACKNOWLEDGED, 0) >=
        CURRENT_TELEMETRY_NOTICE_VERSION
    )
}

export async function setHasUserSeenTelemetryNotice(extensionContext: vscode.ExtensionContext): Promise<void> {
    await extensionContext.globalState.update(TELEMETRY_NOTICE_VERSION_ACKNOWLEDGED, CURRENT_TELEMETRY_NOTICE_VERSION)
    getLogger().verbose('Telemetry notice has been shown')
}

/**
 * Prompts user to Enable/Disable/Defer on Telemetry, then
 * handles the response appropriately.
 */
function showTelemetryNotice(extensionContext: vscode.ExtensionContext) {
    getLogger().verbose('Showing telemetry notice')

    const telemetryNoticeText: string = localize(
        'AWS.telemetry.notificationMessage',
        '{0} Toolkit collects anonymous usage metrics to help drive toolkit improvements. This can be changed in the settings.',
        getIdeProperties().company
    )

    // Don't wait for a response
    void vscode.window
        .showInformationMessage(telemetryNoticeText, noticeResponseViewSettings, noticeResponseOk)
        .then(async response => handleTelemetryNoticeResponse(response, extensionContext))
}

export async function handleTelemetryNoticeResponse(
    response: string | undefined,
    extensionContext: vscode.ExtensionContext
) {
    try {
        getLogger().verbose(`Telemetry notice response: ${response}`)

        if (!response) {
            // undefined == user discarded notice
            return
        }

        await setHasUserSeenTelemetryNotice(extensionContext)

        // noticeResponseOk is a no-op

        if (response === noticeResponseViewSettings) {
            await openSettings('aws.telemetry')
        }
    } catch (err) {
        getLogger().error('Error while handling response from telemetry notice: %O', err as Error)
    }
}
/**
 * Setup the telemetry client id when activating the extension.
 * This forces Amazon Q and AWS Toolkit to use same telemetry client id.
 * Case 1: If Q activates first, then Q also write its client id to settings, Toolkit pickup this client id
 * Case 2: If toolkit activates first, then vice versa.
 * Case 3: If older version toolkit activates, then new Q activates, Q uses a new client id temporarily.
 *         When toolkit is updated, toolkit writes client id to settings. Q then pickup the new client id.
 * @param extensionId the extension id
 */
async function setupTelemetryClientId(extensionId: string) {
    try {
        let clientId = globals.context.globalState.get<string>('telemetryClientId')
        const sharedClientId = TelemetryIdSettings.instance.get<string>(telemetryClientIdKey, '')
        if (clientId && sharedClientId) {
            if (clientId !== sharedClientId) {
                if (extensionId === VSCODE_EXTENSION_ID.awstoolkit) {
                    await TelemetryIdSettings.instance.update(telemetryClientIdKey, clientId)
                } else if (extensionId === VSCODE_EXTENSION_ID.amazonq) {
                    await globals.context.globalState.update('telemetryClientId', sharedClientId)
                }
            }
        } else if (clientId && !sharedClientId) {
            await TelemetryIdSettings.instance.update(telemetryClientIdKey, sharedClientId)
        } else if (!clientId && sharedClientId) {
            await globals.context.globalState.update('telemetryClientId', sharedClientId)
        } else {
            clientId = randomUUID()
            await globals.context.globalState.update('telemetryClientId', clientId)
            await TelemetryIdSettings.instance.update(telemetryClientIdKey, clientId)
        }
    } catch (error) {
        getLogger().error('Could not setup a client id. Reason: %O ', error)
    }
}
