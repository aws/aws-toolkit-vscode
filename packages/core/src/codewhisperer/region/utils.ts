/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()
import { AmazonQPromptSettings } from '../../shared/settings'
import { telemetry } from '../../shared/telemetry/telemetry'
import vscode from 'vscode'
import { placeholder } from '../../shared/vscode/commands2'
import { toastMessage } from '../commands/types'

/**
 * Creates a toast message telling the user they need to select a Developer Profile
 */
export async function notifySelectDeveloperProfile() {
    const suppressId = 'amazonQSelectDeveloperProfile'
    const settings = AmazonQPromptSettings.instance
    const shouldShow = settings.isPromptEnabled(suppressId)
    if (!shouldShow) {
        return
    }

    const message = localize(
        'aws.amazonq.profile.mustSelectMessage',
        'You must select a Q Developer Profile for Amazon Q features to work.'
    )
    const selectProfile = 'Select Profile'
    const dontShowAgain = 'Dont Show Again'

    await telemetry.toolkit_showNotification.run(async () => {
        telemetry.record({ id: 'mustSelectDeveloperProfileMessage' })
        void vscode.window.showWarningMessage(message, selectProfile, dontShowAgain).then(async (resp) => {
            await telemetry.toolkit_invokeAction.run(async () => {
                if (resp === selectProfile) {
                    // Show Profile
                    telemetry.record({ action: 'select' })
                    void vscode.commands.executeCommand('aws.amazonq.selectRegionProfile', placeholder, toastMessage)
                } else if (resp === dontShowAgain) {
                    telemetry.record({ action: 'dontShowAgain' })
                    await settings.disablePrompt(suppressId)
                } else {
                    telemetry.record({ action: 'ignore' })
                }
            })
        })
    })
}
