/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { Commands } from '../../shared/vscode/commands2'
import { getIcon } from '../../shared/icons'
import { focusAmazonQPanel, showTransformByQ } from '../../codewhisperer/commands/basicCommands'
import { transformByQState } from '../../codewhisperer/models/model'
import * as CodeWhispererConstants from '../../codewhisperer/models/constants'
import { amazonQHelpUrl } from '../../shared/constants'

const localize = nls.loadMessageBundle()

export const learnMoreAmazonQCommand = Commands.declare('aws.amazonq.learnMore', () => () => {
    vscode.env.openExternal(vscode.Uri.parse(amazonQHelpUrl))
})

export const createLearnMoreNode = () =>
    learnMoreAmazonQCommand.build().asTreeNode({
        label: localize('AWS.amazonq.learnMore', 'Learn More About Amazon Q (Preview)'),
        iconPath: getIcon('vscode-question'),
        contextValue: 'awsAmazonQLearnMoreNode',
    })

export const switchToAmazonQCommand = Commands.declare('_aws.amazonq.focusView', () => focusAmazonQPanel)

export const switchToAmazonQNode = () =>
    switchToAmazonQCommand.build().asTreeNode({
        label: 'Switch to Q Chat',
        iconPath: getIcon('vscode-comment'),
        contextValue: 'awsToAmazonQChatNode',
    })

export const createTransformByQ = () => {
    const prefix = transformByQState.getPrefixTextForButton()
    let status = transformByQState.getPolledJobStatus().toLowerCase()
    if (transformByQState.isRunning()) {
        vscode.commands.executeCommand('setContext', 'gumby.isTransformAvailable', false)
        if (status === '') {
            // job is running but polling has not started yet, so display generic messsage
            status = CodeWhispererConstants.transformByQStateRunningMessage
        }
    } else if (transformByQState.isCancelled()) {
        status = CodeWhispererConstants.transformByQStateCancellingMessage
    } else if (transformByQState.isFailed()) {
        status = CodeWhispererConstants.transformByQStateFailedMessage
    } else if (transformByQState.isSucceeded()) {
        status = CodeWhispererConstants.transformByQStateSucceededMessage
    } else if (transformByQState.isPartiallySucceeded()) {
        status = CodeWhispererConstants.transformByQStatePartialSuccessMessage
    } else if (transformByQState.isNotStarted()) {
        status = ''
    }
    return showTransformByQ.build('qTreeNode').asTreeNode({
        label: status !== '' ? `${prefix} Transform [Job status: ` + status + `]` : `Transform`,
        iconPath: transformByQState.getIconForButton(),
        tooltip: `${prefix} Transform`,
        contextValue: `${prefix}TransformByQ`,
    })
}
