/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as telemetry from '../../shared/telemetry/telemetry'
import * as vscode from 'vscode'
import { DefaultSettingsConfiguration } from '../../shared/settingsConfiguration'
import { showConfirmationMessage } from '../../shared/utilities/messages'
import { AppRunnerServiceNode } from '../explorer/apprunnerServiceNode'

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

export async function pauseService(node: AppRunnerServiceNode): Promise<void> {
    let telemetryResult: telemetry.Result = 'Failed'

    try {
        const settings = new DefaultSettingsConfiguration('aws')

        // TODO: store this an actual setting
        const shouldNotify = settings.readSetting<boolean>('apprunner.pause-notify', true)
        const notifyPrompt = localize(
            'aws.apprunner.pauseService.notify',
            'Your service will be unavailable while paused. ' +
                'You can resume the service once the pause operation is complete.'
        )
        const confirmationOptions = { prompt: notifyPrompt, confirm: 'Confirm', cancel: 'Cancel' }

        if (shouldNotify && !(await showConfirmationMessage(confirmationOptions, vscode.window))) {
            telemetryResult = 'Cancelled'
            return
        }

        await node.pause()
        telemetryResult = 'Succeeded'
    } finally {
        telemetry.recordApprunnerPauseService({
            result: telemetryResult,
            passive: false,
        })
    }
}
