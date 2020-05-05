/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AwsContext } from '../awsContext'
import { SettingsConfiguration } from '../settingsConfiguration'
import { DefaultTelemetryService } from './defaultTelemetryService'
import { ext } from '../extensionGlobals'
import { getLogger } from '../logger'
import { TelemetryService } from './telemetryService'

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

const LEGACY_SETTINGS_TELEMETRY_VALUE_DISABLE = 'Disable'

const telemetryNoticeText: string = localize(
    'AWS.telemetry.notificationMessage',
    'The AWS Toolkit collects usage metrics by default. These metrics help drive toolkit improvements. This setting can be changed from the IDE settings.'
)

export const noticeResponseViewSettings = localize('AWS.telemetry.notificationViewSettings', 'View Settings')
export const noticeResponseOk = localize('AWS.telemetry.notificationOk', 'OK')

const AWS_TELEMETRY_KEY = 'telemetry'
export const TELEMETRY_NOTICE_VERSION_ACKNOWLEDGED = 'awsTelemetryNoticeVersionAck'
// Telemetry Notice Versions
// Versioning the users' notice acknowledgement is forward looking, and allows us to better
// track scenarios when we may need to re-prompt the user about telemetry.
// Version 1 was the original notice, allowing users to enable/disable/defer telemetry
// Version 2 states that there is metrics gathering, which can be adjusted in the options
const CURRENT_TELEMETRY_NOTICE_VERSION = 2

/**
 * Sets up the Metrics system and initializes ext.telemetry
 */
export async function activate(activateArguments: {
    extensionContext: vscode.ExtensionContext
    awsContext: AwsContext
    toolkitSettings: SettingsConfiguration
}) {
    ext.telemetry = new DefaultTelemetryService(activateArguments.extensionContext, activateArguments.awsContext)

    // Configure telemetry based on settings, and default to enabled
    applyTelemetryEnabledState(ext.telemetry, activateArguments.toolkitSettings)

    // Prompt user about telemetry if they haven't been
    if (!hasUserSeenTelemetryNotice(activateArguments.extensionContext)) {
        showTelemetryNotice(activateArguments.extensionContext)
    }

    // When there are configuration changes, update the telemetry service appropriately
    vscode.workspace.onDidChangeConfiguration(
        async event => {
            if (!ext.telemetry) {
                return
            }
            if (
                event.affectsConfiguration('telemetry.enableTelemetry') ||
                event.affectsConfiguration('aws.telemetry')
            ) {
                applyTelemetryEnabledState(ext.telemetry, activateArguments.toolkitSettings)
            }
        },
        undefined,
        activateArguments.extensionContext.subscriptions
    )
}

export function isTelemetryEnabled(toolkitSettings: SettingsConfiguration): boolean {
    // Setting used to be an enum, but is now a boolean.
    // We don't have api-based strong type support, so we have to process this value manually.
    const value = toolkitSettings.readSetting<any>(AWS_TELEMETRY_KEY)

    // Handle original opt-out value (setting used to be a tri-state string value)
    if (value === LEGACY_SETTINGS_TELEMETRY_VALUE_DISABLE) {
        return false
    }

    // Current value is expected to be a boolean
    if (typeof value === 'boolean') {
        return value
    }

    // Treat anything else (unexpected values, datatypes, or undefined) as opt-in
    return true
}

function applyTelemetryEnabledState(telemetry: TelemetryService, toolkitSettings: SettingsConfiguration) {
    telemetry.telemetryEnabled = isTelemetryEnabled(toolkitSettings)
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
            vscode.commands.executeCommand('workbench.action.openSettings')
        }
    } catch (err) {
        getLogger().error('Error while handling reponse from telemetry notice', err as Error)
    }
}
