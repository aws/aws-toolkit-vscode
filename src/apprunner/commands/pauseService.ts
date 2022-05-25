/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import * as localizedText from '../../shared/localizedText'
import { showConfirmationMessage } from '../../shared/utilities/messages'
import { AppRunnerServiceNode } from '../explorer/apprunnerServiceNode'
import { PromptSettings } from '../../shared/settings'
import { getTelemetryLogger } from '../../shared/telemetry/recorder'

export async function pauseService(node: AppRunnerServiceNode): Promise<void> {
    const prompts = PromptSettings.instance
    const shouldNotify = await prompts.isPromptEnabled('apprunnerNotifyPause')
    const notifyPrompt = localize(
        'aws.apprunner.pauseService.notify',
        'Your service will be unavailable while paused. ' +
            'You can resume the service once the pause operation is complete.'
    )
    const confirmationOptions = { prompt: notifyPrompt, confirm: localizedText.ok, cancel: localizedText.cancel }

    if (shouldNotify && !(await showConfirmationMessage(confirmationOptions, vscode.window))) {
        getTelemetryLogger('ApprunnerPauseService').recordResult('Cancelled')
        return
    }

    await node.pause()
}
