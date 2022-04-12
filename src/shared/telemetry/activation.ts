/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from '../extensionGlobals'

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import { AwsContext } from '../awsContext'
import { DefaultTelemetryService } from './defaultTelemetryService'
import { getLogger } from '../logger'
import { getComputeRegion, getIdeProperties, isCloud9 } from '../extensionUtilities'
import { fromPackageJson, SettingsConfiguration } from '../settingsConfiguration'

const LEGACY_SETTINGS_TELEMETRY_VALUE_DISABLE = 'Disable'
const LEGACY_SETTINGS_TELEMETRY_VALUE_ENABLE = 'Enable'
const TELEMETRY_SETTING_DEFAULT = true
const TELEMETRY_KEY = 'telemetry'

export const noticeResponseViewSettings = localize('AWS.telemetry.notificationViewSettings', 'View Settings')
export const noticeResponseOk = localize('AWS.telemetry.notificationOk', 'OK')

export const TELEMETRY_NOTICE_VERSION_ACKNOWLEDGED = 'awsTelemetryNoticeVersionAck'

// Telemetry Notice Versions
// Versioning the users' notice acknowledgement is forward looking, and allows us to better
// track scenarios when we may need to re-prompt the user about telemetry.
// Version 1 was the original notice, allowing users to enable/disable/defer telemetry
// Version 2 states that there is metrics gathering, which can be adjusted in the options
const CURRENT_TELEMETRY_NOTICE_VERSION = 2

/**
 * Sets up the Metrics system and initializes globals.telemetry
 */
export async function activate(
    extensionContext: vscode.ExtensionContext,
    awsContext: AwsContext,
    settings: SettingsConfiguration
) {
    globals.telemetry = new DefaultTelemetryService(extensionContext, awsContext, getComputeRegion())

    const config = new TelemetryConfig(settings)
    globals.telemetry.telemetryEnabled = config.isEnabled()

    extensionContext.subscriptions.push(
        config.onDidChange(event => {
            if (event.key === TELEMETRY_KEY) {
                globals.telemetry.telemetryEnabled = config.isEnabled()
            }
        })
    )

    // Prompt user about telemetry if they haven't been
    if (!isCloud9() && !hasUserSeenTelemetryNotice(extensionContext)) {
        showTelemetryNotice(extensionContext)
    }
}

export function convertLegacy(value: unknown): boolean {
    if (typeof value === 'boolean') {
        return value
    }

    // Set telemetry value to boolean if the current value matches the legacy value
    if (value === LEGACY_SETTINGS_TELEMETRY_VALUE_DISABLE) {
        return false
    } else if (value === LEGACY_SETTINGS_TELEMETRY_VALUE_ENABLE) {
        return true
    } else {
        throw new TypeError(`Unknown telemetry setting: ${value}`)
    }
}

export class TelemetryConfig extends fromPackageJson('aws', { telemetry: convertLegacy }) {
    public isEnabled(): boolean {
        try {
            return this.get(TELEMETRY_KEY, TELEMETRY_SETTING_DEFAULT)
        } catch (error) {
            vscode.window.showErrorMessage(
                localize(
                    'AWS.message.error.settings.telemetry.invalid_type',
                    'The aws.telemetry value must be a boolean'
                )
            )
            return TELEMETRY_SETTING_DEFAULT
        }
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
        'The {0} Toolkit collects usage metrics by default. These metrics help drive toolkit improvements. This setting can be changed from the IDE settings.',
        getIdeProperties().company
    )

    // Don't wait for a response
    vscode.window
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

        setHasUserSeenTelemetryNotice(extensionContext)

        // noticeResponseOk is a no-op

        if (response === noticeResponseViewSettings) {
            vscode.commands.executeCommand('workbench.action.openSettings', `@id:aws.${TELEMETRY_KEY}`)
        }
    } catch (err) {
        getLogger().error('Error while handling response from telemetry notice: %O', err as Error)
    }
}
