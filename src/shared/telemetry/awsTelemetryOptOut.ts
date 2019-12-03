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

export enum TelemetryOptOutOptions {
    Enable,
    Disable,
    SameAsVsCode
}

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
        vscode.workspace.onDidChangeConfiguration(async event => {
            // if telemetry.enableTelemetry changed and user has not expressed a preference
            if (
                event.affectsConfiguration('telemetry.enableTelemetry') &&
                this.settings.readSetting(AwsTelemetryOptOut.AWS_TELEMETRY_KEY) === undefined
            ) {
                await this.updateTelemetryConfiguration(TelemetryOptOutOptions.SameAsVsCode)
            }
        })
    }

    public async updateTelemetryConfiguration(response: TelemetryOptOutOptions) {
        switch (response) {
            case TelemetryOptOutOptions.Enable:
                await this.settings.writeSetting(
                    AwsTelemetryOptOut.AWS_TELEMETRY_KEY,
                    true,
                    vscode.ConfigurationTarget.Global
                )
                this.service.telemetryEnabled = true
                break

            case TelemetryOptOutOptions.Disable:
                await this.settings.writeSetting(
                    AwsTelemetryOptOut.AWS_TELEMETRY_KEY,
                    false,
                    vscode.ConfigurationTarget.Global
                )
                this.service.telemetryEnabled = false
                break

            case TelemetryOptOutOptions.SameAsVsCode:
                await this.settings.writeSetting(
                    AwsTelemetryOptOut.AWS_TELEMETRY_KEY,
                    undefined,
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
        let response: string | undefined
        if (!ext.context.globalState.get<boolean>(AwsTelemetryOptOut.TELEMETRY_OPT_OUT_SHOWN)) {
            response = await this.showNotification()
            await ext.context.globalState.update(AwsTelemetryOptOut.TELEMETRY_OPT_OUT_SHOWN, true)
        } else {
            response = this.settings.readSetting<string>(AwsTelemetryOptOut.AWS_TELEMETRY_KEY)
        }
        const enumValue = this.responseToOptionEnumValue(response)

        await this.updateTelemetryConfiguration(enumValue)
        this.service.notifyOptOutOptionMade()
    }

    public async showNotification(): Promise<string | undefined> {
        const notificationMessage: string = localize(
            'AWS.telemetry.notificationMessage',
            // prettier-ignore
            'Please help improve the AWS Toolkit by enabling it to send usage data to AWS. You can always change your mind later by going to the "AWS Configuration" section in your user settings.'
        )

        return vscode.window.showInformationMessage(notificationMessage, this.responseYes, this.responseNo)
    }

    private responseToOptionEnumValue(response: string | undefined) {
        switch (response) {
            case this.responseYes:
                return TelemetryOptOutOptions.Enable

            case this.responseNo:
                return TelemetryOptOutOptions.Disable

            default:
                return TelemetryOptOutOptions.SameAsVsCode
        }
    }
}
