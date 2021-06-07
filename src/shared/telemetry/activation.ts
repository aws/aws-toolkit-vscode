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
import { getComputeRegion, getIdeProperties, isCloud9 } from '../extensionUtilities'
const localize = nls.loadMessageBundle()

const LEGACY_SETTINGS_TELEMETRY_VALUE_DISABLE = 'Disable'
const LEGACY_SETTINGS_TELEMETRY_VALUE_ENABLE = 'Enable'
const TELEMETRY_SETTING_DEFAULT = true

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
    ext.telemetry = new DefaultTelemetryService(
        activateArguments.extensionContext,
        activateArguments.awsContext,
        getComputeRegion()
    )

    // Convert setting to boolean if it is not already
    await sanitizeTelemetrySetting(activateArguments.toolkitSettings)

    // Configure telemetry based on settings, and default to enabled
    applyTelemetryEnabledState(ext.telemetry, activateArguments.toolkitSettings)

    // Prompt user about telemetry if they haven't been
    if (!isCloud9() && !hasUserSeenTelemetryNotice(activateArguments.extensionContext)) {
        showTelemetryNotice(activateArguments.extensionContext)
    }

    // When there are configuration changes, update the telemetry service appropriately
    vscode.workspace.onDidChangeConfiguration(
        async event => {
            if (
                event.affectsConfiguration('telemetry.enableTelemetry') ||
                event.affectsConfiguration('aws.telemetry')
            ) {
                if (!ext.telemetry) {
                    getLogger().warn(
                        'Telemetry configuration changed, but telemetry is undefined. This can happen during testing. #1071'
                    )
                    return
                }

                validateTelemetrySettingType(activateArguments.toolkitSettings)
                applyTelemetryEnabledState(ext.telemetry, activateArguments.toolkitSettings)
            }
        },
        undefined,
        activateArguments.extensionContext.subscriptions
    )
}

/*
 * Formats the AWS telemetry setting to a boolean: false if setting value was 'Disable' or false, true for everything else
 */
export async function sanitizeTelemetrySetting(toolkitSettings: SettingsConfiguration): Promise<void> {
    const value = toolkitSettings.readSetting<any>(AWS_TELEMETRY_KEY)

    if (typeof value === 'boolean') {
        return
    }

    // Set telemetry value to boolean if the current value matches the legacy value
    if (value === LEGACY_SETTINGS_TELEMETRY_VALUE_DISABLE) {
        await toolkitSettings.writeSetting<any>(AWS_TELEMETRY_KEY, false, vscode.ConfigurationTarget.Global)
    } else if (value === LEGACY_SETTINGS_TELEMETRY_VALUE_ENABLE) {
        await toolkitSettings.writeSetting<any>(AWS_TELEMETRY_KEY, true, vscode.ConfigurationTarget.Global)
    }
}

export function isTelemetryEnabled(toolkitSettings: SettingsConfiguration): boolean {
    // Setting used to be an enum, but is now a boolean.
    // We don't have api-based strong type support, so we have to process this value manually.
    const value = toolkitSettings.readSetting<any>(AWS_TELEMETRY_KEY)

    // Handle original opt-out value (setting used to be a tri-state string value)
    if (value === LEGACY_SETTINGS_TELEMETRY_VALUE_DISABLE) {
        return false
    }

    if (typeof value === 'boolean') {
        return value
    } else {
        return TELEMETRY_SETTING_DEFAULT
    }
}

function validateTelemetrySettingType(toolkitSettings: SettingsConfiguration): void {
    const value = toolkitSettings.readSetting<any>(AWS_TELEMETRY_KEY)
    if (typeof value !== 'boolean') {
        getLogger().error('In settings.json, aws.telemetry value must be a boolean')
        vscode.window.showErrorMessage(
            localize('AWS.message.error.settings.telemetry.invalid_type', 'The aws.telemetry value must be a boolean')
        )
    }
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
            vscode.commands.executeCommand('workbench.action.openSettings')
        }
    } catch (err) {
        getLogger().error('Error while handling response from telemetry notice: %O', err as Error)
    }
}
