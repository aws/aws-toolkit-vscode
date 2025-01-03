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
import { getComputeRegion, isAmazonQ, isCloud9, productName } from '../extensionUtilities'
import { openSettingsId, Settings } from '../settings'
import { getSessionId, TelemetryConfig } from './util'
import { isAutomation, isReleaseVersion } from '../vscode/env'
import { AWSProduct } from './clienttelemetry'
import { DefaultTelemetryClient } from './telemetryClient'
import { telemetry } from './telemetry'

export const noticeResponseViewSettings = localize('AWS.telemetry.notificationViewSettings', 'Settings')
export const noticeResponseOk = localize('AWS.telemetry.notificationOk', 'OK')

// Telemetry Notice Versions
// Versioning the users' notice acknowledgement is forward looking, and allows us to better
// track scenarios when we may need to re-prompt the user about telemetry.
// Version 1 was the original notice, allowing users to enable/disable/defer telemetry
// Version 2 states that there is metrics gathering, which can be adjusted in the options
const CURRENT_TELEMETRY_NOTICE_VERSION = 2 // eslint-disable-line @typescript-eslint/naming-convention

/**
 * Sets up the Metrics system and initializes globals.telemetry
 */
export async function activate(
    extensionContext: vscode.ExtensionContext,
    awsContext: AwsContext,
    settings: Settings,
    productName: AWSProduct
) {
    const config = new TelemetryConfig(settings)

    DefaultTelemetryClient.productName = productName
    globals.telemetry = await DefaultTelemetryService.create(awsContext, getComputeRegion())

    const isAmazonQExt = isAmazonQ()
    try {
        await globals.telemetry.setTelemetryEnabled(config.isEnabled())

        extensionContext.subscriptions.push(
            (isAmazonQExt ? config.amazonQConfig : config.toolkitConfig).onDidChange(async (event) => {
                if (event.key === 'telemetry') {
                    const val = config.isEnabled()
                    const settingId = isAmazonQExt ? 'amazonQ.telemetry' : 'aws.telemetry'

                    // Record 'disabled' right before its turned off, so we can send this + the batch we have already.
                    if (!val) {
                        telemetry.aws_modifySetting.emit({ settingId, settingState: 'false', result: 'Succeeded' })
                    }

                    await globals.telemetry.setTelemetryEnabled(val)

                    // Record 'enabled' after its turned on, otherwise this is ignored.
                    if (val) {
                        telemetry.aws_modifySetting.emit({ settingId, settingState: 'true', result: 'Succeeded' })
                    }
                }
            })
        )

        // Prompt user about telemetry if they haven't been
        if (!isCloud9() && !hasUserSeenTelemetryNotice()) {
            showTelemetryNotice()
        }

        await globals.telemetry.start()

        if (globals.telemetry.telemetryEnabled) {
            // Only log the IDs if telemetry is enabled, so that users who have it disabled do not think we are sending events.
            getLogger().info(`Telemetry clientId: ${globals.telemetry.clientId}`)
            getLogger().info(`Telemetry sessionId: ${getSessionId()}`)
        }
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

export function hasUserSeenTelemetryNotice(): boolean {
    return globals.globalState.tryGet('awsTelemetryNoticeVersionAck', Number, 0) >= CURRENT_TELEMETRY_NOTICE_VERSION
}

export async function setHasUserSeenTelemetryNotice(): Promise<void> {
    await globals.globalState.update('awsTelemetryNoticeVersionAck', CURRENT_TELEMETRY_NOTICE_VERSION)
    getLogger().verbose('Telemetry notice has been shown')
}

/**
 * Prompts user to Enable/Disable/Defer on Telemetry, then
 * handles the response appropriately.
 */
function showTelemetryNotice() {
    getLogger().verbose('Showing telemetry notice')

    const telemetryNoticeText: string = localize(
        'AWS.telemetry.notificationMessage',
        '{0} collects anonymous usage metrics to improve the product. You can opt-out in settings.',
        productName()
    )

    // Don't wait for a response
    void vscode.window
        .showInformationMessage(telemetryNoticeText, noticeResponseViewSettings, noticeResponseOk)
        .then(async (response) => handleTelemetryNoticeResponse(response))
}

export async function handleTelemetryNoticeResponse(response: string | undefined) {
    try {
        getLogger().verbose(`Telemetry notice response: ${response}`)

        if (!response) {
            // undefined == user discarded notice
            return
        }

        await setHasUserSeenTelemetryNotice()

        // noticeResponseOk is a no-op

        if (response === noticeResponseViewSettings) {
            await openSettingsId(isAmazonQ() ? 'amazonQ.telemetry' : 'aws.telemetry')
        }
    } catch (err) {
        getLogger().error('Error while handling response from telemetry notice: %O', err as Error)
    }
}
