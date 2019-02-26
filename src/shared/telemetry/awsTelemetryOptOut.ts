/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { ext } from '../extensionGlobals'
import { SettingsConfiguration } from '../settingsConfiguration'
import { TelemetryService } from './telemetryService'
const localize = nls.loadMessageBundle()

export class AwsTelemetryOptOut {
    private static readonly AWS_TELEMETRY_KEY = 'telemetry'
    private static readonly TELEMETRY_OPT_OUT_SHOWN = 'awsTelemetryOptOutShown'

    private readonly responseYes: string = localize('AWS.generic.response.yes', 'Yes')
    private readonly responseNo: string = localize('AWS.generic.response.no', 'No')

    public constructor(
        public readonly service: TelemetryService,
        private readonly settings: SettingsConfiguration
    ) {
        vscode.workspace.onDidChangeConfiguration(async event => {
            // if telemetry.enableTelemetry changed and user has not expressed a preference
            if (event.affectsConfiguration('telemetry.enableTelemetry')
                && this.settings.readSetting(AwsTelemetryOptOut.AWS_TELEMETRY_KEY) === undefined
            ) {
                await this.updateTelemetryConfiguration(undefined)
            }
        })
    }

    public async updateTelemetryConfiguration(response: string | undefined) {
        switch (response) {
            case this.responseYes:
                await this.settings.writeSetting(
                    AwsTelemetryOptOut.AWS_TELEMETRY_KEY,
                    true,
                    vscode.ConfigurationTarget.Global
                )
                this.service.telemetryEnabled = true
                break

            case this.responseNo:
                await this.settings.writeSetting(
                    AwsTelemetryOptOut.AWS_TELEMETRY_KEY,
                    false,
                    vscode.ConfigurationTarget.Global
                )
                this.service.telemetryEnabled = false
                break

            default:
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

    public async ensureUserNotified(): Promise<void> {
        if (!ext.context.globalState.get<boolean>(AwsTelemetryOptOut.TELEMETRY_OPT_OUT_SHOWN)) {
            const response = await this.showNotification()
            await this.updateTelemetryConfiguration(response)
            await ext.context.globalState.update(AwsTelemetryOptOut.TELEMETRY_OPT_OUT_SHOWN, true)
        }
    }

    public async showNotification(): Promise<string | undefined> {
        const notificationMessage: string = localize(
            'AWS.telemetry.notificationMessage',
            'Please help improve the AWS Toolkit by enabling anonymous usage data to be sent to AWS. '
            + 'You can always change your mind later by going to the "AWS Configuration" section in your user settings.'
        )

        return vscode.window.showInformationMessage(notificationMessage, this.responseYes, this.responseNo)
    }

    private getVSCodeTelemetrySetting(): boolean {
        const config = vscode.workspace.getConfiguration('telemetry').get<boolean>('enableTelemetry')
        if (config !== undefined) {
            return config
        } else {
            // fallback to false if this hasn't been set for some reason
            return false
        }
    }
}
