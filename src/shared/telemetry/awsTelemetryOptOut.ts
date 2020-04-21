/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { ext } from '../extensionGlobals'
import { SettingsConfiguration } from '../settingsConfiguration'
import { TelemetryService } from './telemetryService'
const localize = nls.loadMessageBundle()

// SETTINGS_TELEMETRY_VALUE_XXX must be kept in sync with package.json "aws.telemetry" configuration values
export const SETTINGS_TELEMETRY_VALUE_ENABLE = 'Enable'
export const SETTINGS_TELEMETRY_VALUE_DISABLE = 'Disable'
export const SETTINGS_TELEMETRY_VALUE_USEIDE = 'Use IDE settings'

export class AwsTelemetryOptOut {
    private static readonly AWS_TELEMETRY_KEY = 'telemetry'
    private static readonly TELEMETRY_OPT_OUT_SHOWN = 'awsTelemetryOptOutShown'

    private readonly responseYes: string = localize('AWS.telemetry.notificationYes', 'Enable')
    private readonly responseNo: string = localize('AWS.telemetry.notificationNo', 'Disable')

    public constructor(
        public readonly service: TelemetryService,
        private readonly settings: SettingsConfiguration,
        private readonly getVSCodeTelemetrySetting: () => boolean = () =>
            !!vscode.workspace.getConfiguration('telemetry').get<boolean>('enableTelemetry')
    ) {
        // TODO : update telemetry configuration when aws.telemetry changes (so that we can enable/disable without a restart)
        vscode.workspace.onDidChangeConfiguration(async event => {
            // if telemetry.enableTelemetry changed and user has not expressed a preference
            if (
                event.affectsConfiguration('telemetry.enableTelemetry') &&
                this.settings.readSetting(AwsTelemetryOptOut.AWS_TELEMETRY_KEY) === SETTINGS_TELEMETRY_VALUE_USEIDE
            ) {
                await this.updateTelemetryConfiguration(SETTINGS_TELEMETRY_VALUE_USEIDE)
            }
        })
    }

    public async updateTelemetryConfiguration(telemetrySettingsValue: string) {
        switch (telemetrySettingsValue) {
            case SETTINGS_TELEMETRY_VALUE_ENABLE:
                await this.settings.writeSetting(
                    AwsTelemetryOptOut.AWS_TELEMETRY_KEY,
                    telemetrySettingsValue,
                    vscode.ConfigurationTarget.Global
                )
                this.service.telemetryEnabled = true
                break

            case SETTINGS_TELEMETRY_VALUE_DISABLE:
                await this.settings.writeSetting(
                    AwsTelemetryOptOut.AWS_TELEMETRY_KEY,
                    telemetrySettingsValue,
                    vscode.ConfigurationTarget.Global
                )
                this.service.telemetryEnabled = false
                break

            default:
                await this.settings.writeSetting(
                    AwsTelemetryOptOut.AWS_TELEMETRY_KEY,
                    SETTINGS_TELEMETRY_VALUE_USEIDE,
                    vscode.ConfigurationTarget.Global
                )
                const vsCodeTelemetryEnabled = this.getVSCodeTelemetrySetting()
                this.service.telemetryEnabled = vsCodeTelemetryEnabled
                break
        }
    }

    /**
     * Caution: you probably do not want to await this method
     *
     * This method awaits a showInfo call, which blocks until the user selects an option
     * or explicitly cancels the dialog. 'Esc' on the dialog will continue to block, waiting for a response
     * Ensure that you handle this suitably.
     */
    public async ensureUserNotified(): Promise<void> {
        let optInSetting: string = SETTINGS_TELEMETRY_VALUE_USEIDE
        if (!ext.context.globalState.get<boolean>(AwsTelemetryOptOut.TELEMETRY_OPT_OUT_SHOWN)) {
            optInSetting = await this.promptForTelemetryOptIn()
            await ext.context.globalState.update(AwsTelemetryOptOut.TELEMETRY_OPT_OUT_SHOWN, true)
        } else {
            optInSetting =
                this.settings.readSetting<string>(AwsTelemetryOptOut.AWS_TELEMETRY_KEY) ??
                SETTINGS_TELEMETRY_VALUE_USEIDE
        }

        await this.updateTelemetryConfiguration(optInSetting)
        this.service.notifyOptOutOptionMade()
    }

    /**
     * Prompts user to Enable/Disable/Defer on Telemetry
     * Returns a valid settings value
     */
    public async promptForTelemetryOptIn(): Promise<string> {
        const notificationMessage: string = localize(
            'AWS.telemetry.notificationMessage',
            // prettier-ignore
            'Please help improve the AWS Toolkit by enabling it to send usage data to AWS. You can always change your mind later by going to the "AWS Configuration" section in your user settings.'
        )

        const response = await vscode.window.showInformationMessage(
            notificationMessage,
            this.responseYes,
            this.responseNo
        )

        switch (response) {
            case this.responseYes:
                return SETTINGS_TELEMETRY_VALUE_ENABLE

            case this.responseNo:
                return SETTINGS_TELEMETRY_VALUE_DISABLE

            // undefined == user discarded notice
            default:
                return SETTINGS_TELEMETRY_VALUE_USEIDE
        }
    }
}
