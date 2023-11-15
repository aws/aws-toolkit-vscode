/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { Commands } from '../../shared/vscode/commands2'
import { getIcon } from '../../shared/icons'
import { focusAmazonQPanel } from '../../codewhisperer/commands/basicCommands'

// TODO: UPDATE ME!!!
export const learnMoreAmazonQCommand = Commands.declare('_aws.amazonq.learnMore', () => () => {
    vscode.env.openExternal(vscode.Uri.parse('https://aws.amazon.com'))
})

export const createLearnMoreNode = () =>
    learnMoreAmazonQCommand.build().asTreeNode({
        label: 'Learn More About Amazon Q (Preview)',
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

// TODO: Update with real command!
export const runQTransformCommand = Commands.declare('_aws.amazonq.runQTransform', () => runQTransform)

export const runQTransformNode = () =>
    runQTransformCommand.build().asTreeNode({
        label: 'Run Transform By Q',
        iconPath: getIcon('vscode-play'),
        contextValue: 'awsRunQTransformNode',
    })

function runQTransform() {
    /* stub */
}
