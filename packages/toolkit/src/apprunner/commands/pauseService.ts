/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as localizedText from '../../shared/localizedText'
import { showConfirmationMessage } from '../../shared/utilities/messages'
import { AppRunnerServiceNode } from '../explorer/apprunnerServiceNode'
import { PromptSettings } from '../../shared/settings'
import { telemetry } from '../../shared/telemetry/telemetry'
import { Result } from '../../shared/telemetry/telemetry'

export async function pauseService(node: AppRunnerServiceNode): Promise<void> {
    let telemetryResult: Result = 'Failed'

    try {
        const prompts = PromptSettings.instance
        const shouldNotify = await prompts.isPromptEnabled('apprunnerNotifyPause')
        const notifyPrompt = localize(
            'aws.apprunner.pauseService.notify',
            'Your service will be unavailable while paused. ' +
                'You can resume the service once the pause operation is complete.'
        )
        const confirmationOptions = { prompt: notifyPrompt, confirm: localizedText.ok, cancel: localizedText.cancel }

        if (shouldNotify && !(await showConfirmationMessage(confirmationOptions))) {
            telemetryResult = 'Cancelled'
            return
        }

        await node.pause()
        telemetryResult = 'Succeeded'
    } finally {
        telemetry.apprunner_pauseService.emit({
            result: telemetryResult,
            passive: false,
        })
    }
}
