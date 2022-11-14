/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { getLogger } from '../../shared/logger'
import * as CodeWhispererConstants from '../models/constants'
import { createExitButton } from '../../shared/ui/buttons'
import { createInputBox } from '../../shared/ui/inputPrompter'
import { isValidResponse } from '../../shared/wizards/wizard'
import { getIcon } from '../../shared/icons'
import { QuickInputLinkButton } from '../../shared/ui/buttons'
import { isValidHttpUrl } from './commonUtil'
import { AuthUtil } from './authUtil'
import { CancellationError } from '../../shared/utilities/timeoutUtils'
import { ToolkitError } from '../../shared/errors'

const localize = nls.loadMessageBundle()
export const getStartUrl = async () => {
    const inputBox = createInputBox({
        title: localize('aws.codeWhisperer.signIn.title', 'CodeWhisperer: Add connection to AWS'),
        placeholder: localize(
            'aws.codeWhisperer.inputStartUrl.placeholder',
            "Enter start URL for your organization's SSO"
        ),
        buttons: [createStartUrlHelpButton(), createExitButton()],
    })
    const userInput = await inputBox.prompt()
    if (!isValidResponse(userInput)) {
        throw new CancellationError('user')
    }
    if (isValidHttpUrl(userInput)) {
        try {
            await AuthUtil.instance.connectToEnterpriseSso(userInput)
        } catch (e) {
            throw ToolkitError.chain(e, CodeWhispererConstants.failedToConnectSso, { code: 'FailedToConnect' })
        }
    } else {
        getLogger().error('Invalid Start URL or Invalid user action')
        vscode.window.showErrorMessage('Invalid Start URL')
        return
    }
    await vscode.commands.executeCommand('aws.codeWhisperer.refresh')
    await vscode.commands.executeCommand('aws.codeWhisperer.enableCodeSuggestions')
}

//TODO: confirm if should just use toolkit team help button
function createStartUrlHelpButton() {
    const iconPath = getIcon('vscode-help')
    const tooltip = localize('AWS.startUrlHelp', `Where do I find my "start url"?`)
    const uri = CodeWhispererConstants.learnMoreUri

    return new QuickInputLinkButton(uri, iconPath, tooltip)
}
