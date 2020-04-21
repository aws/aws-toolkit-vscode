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

// SETTINGS_TELEMETRY_VALUE_XXX must be kept in sync with package.json "aws.telemetry" configuration values
const SETTINGS_TELEMETRY_VALUE_ENABLE = 'Enable'
const SETTINGS_TELEMETRY_VALUE_DISABLE = 'Disable'
const SETTINGS_TELEMETRY_VALUE_USEIDE = 'Use IDE settings'

export const responseEnable = localize('AWS.telemetry.notificationYes', 'Enable')
export const responseDisable = localize('AWS.telemetry.notificationNo', 'Disable')

const AWS_TELEMETRY_KEY = 'telemetry'
const TELEMETRY_OPT_OUT_SHOWN = 'awsTelemetryOptOutShown'

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
    if (hasUserSeenTelemetryNotice(activateArguments.extensionContext)) {
        ext.telemetry.notifyOptOutOptionMade()
    } else {
        promptForTelemetryOptIn(activateArguments.extensionContext, activateArguments.toolkitSettings)
    }

    // When there are configuration changes, update the telemetry service appropriately
    vscode.workspace.onDidChangeConfiguration(
        async event => {
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

function applyTelemetryEnabledState(telemetry: TelemetryService, toolkitSettings: SettingsConfiguration) {
    const optInSetting = toolkitSettings.readSetting<string>(AWS_TELEMETRY_KEY) ?? SETTINGS_TELEMETRY_VALUE_USEIDE

    if (optInSetting === SETTINGS_TELEMETRY_VALUE_ENABLE) {
        telemetry.telemetryEnabled = true
    } else if (optInSetting === SETTINGS_TELEMETRY_VALUE_DISABLE) {
        telemetry.telemetryEnabled = false
    } else {
        telemetry.telemetryEnabled = isVsCodeTelemetryEnabled()
    }
}

function isVsCodeTelemetryEnabled(): boolean {
    return vscode.workspace.getConfiguration('telemetry').get<boolean>('enableTelemetry', true)
}

function hasUserSeenTelemetryNotice(extensionContext: vscode.ExtensionContext): boolean {
    return extensionContext.globalState.get<boolean>(TELEMETRY_OPT_OUT_SHOWN, false)
}

async function setHasUserSeenTelemetryNotice(extensionContext: vscode.ExtensionContext): Promise<void> {
    await extensionContext.globalState.update(TELEMETRY_OPT_OUT_SHOWN, true)
    getLogger().verbose('Telemetry notice has been shown')
}

/**
 * Prompts user to Enable/Disable/Defer on Telemetry, then
 * handles the response appropriately.
 */
function promptForTelemetryOptIn(extensionContext: vscode.ExtensionContext, toolkitSettings: SettingsConfiguration) {
    getLogger().verbose('Showing telemetry notice')

    const notificationMessage: string = localize(
        'AWS.telemetry.notificationMessage',
        // prettier-ignore
        'Please help improve the AWS Toolkit by enabling it to send usage data to AWS. You can always change your mind later by going to the "AWS Configuration" section in your user settings.'
    )

    // Don't wait for a response
    vscode.window
        .showInformationMessage(notificationMessage, responseEnable, responseDisable)
        .then(async response => handleTelemetryNoticeResponse(response, extensionContext, toolkitSettings))
}

export async function handleTelemetryNoticeResponse(
    response: string | undefined,
    extensionContext: vscode.ExtensionContext,
    toolkitSettings: SettingsConfiguration
) {
    try {
        getLogger().verbose(`Telemetry notice response: ${response}`)

        if (!response) {
            // undefined == user discarded notice
            return
        }

        const setting =
            response === responseDisable ? SETTINGS_TELEMETRY_VALUE_DISABLE : SETTINGS_TELEMETRY_VALUE_ENABLE
        getLogger().verbose(`Applying telemetry setting: ${setting}`)
        await toolkitSettings.writeSetting<string>(AWS_TELEMETRY_KEY, setting, vscode.ConfigurationTarget.Global)

        setHasUserSeenTelemetryNotice(extensionContext)
        ext.telemetry.notifyOptOutOptionMade()
    } catch (err) {
        getLogger().error('Error while handling reponse from telemetry notice', err as Error)
    }
}
