/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { Commands, placeholder } from '../../shared/vscode/commands2'
import { getIcon } from '../../shared/icons'
import { installAmazonQExtension, reconnect } from '../../codewhisperer/commands/basicCommands'
import { amazonQHelpUrl } from '../../shared/constants'
import { cwTreeNodeSource } from '../../codewhisperer/commands/types'
import { VSCODE_EXTENSION_ID } from '../../shared/extensions'
import { globals } from '../../shared'
import { amazonQDismissedKey } from '../../codewhisperer/models/constants'
import { _switchToAmazonQ } from './commonNodes'
import { telemetry } from '../../shared/telemetry'
import { ExtensionUse } from '../../auth/utils'

const localize = nls.loadMessageBundle()

export const learnMoreAmazonQCommand = Commands.declare('aws.toolkit.amazonq.learnMore', () => () => {
    void vscode.env.openExternal(vscode.Uri.parse(amazonQHelpUrl))
})

export const qExtensionPageCommand = Commands.declare('aws.toolkit.amazonq.extensionpage', () => () => {
    void vscode.env.openExternal(vscode.Uri.parse(`vscode:extension/${VSCODE_EXTENSION_ID.amazonq}`))
})

export const dismissQTree = Commands.declare(
    { id: 'aws.toolkit.amazonq.dismiss', compositeKey: { 1: 'source' } },
    () => async (source: string) => {
        await telemetry.toolkit_invokeAction.run(async () => {
            telemetry.record({ source: ExtensionUse.instance.isFirstUse() ? 'firstStartUp' : 'none' })
            await globals.context.globalState.update(amazonQDismissedKey, true)
            await vscode.commands.executeCommand('setContext', amazonQDismissedKey, true)
            telemetry.record({ action: 'dismissQExplorerTree' })
        })
    }
)

// Learn more button of Amazon Q now opens the Amazon Q marketplace page.
export const createLearnMoreNode = () =>
    qExtensionPageCommand.build().asTreeNode({
        label: localize('AWS.amazonq.learnMore', 'Learn More About Amazon Q (Preview)'),
        iconPath: getIcon('vscode-question'),
        contextValue: 'awsAmazonQLearnMoreNode',
    })

export function createInstallQNode() {
    return installAmazonQExtension.build().asTreeNode({
        label: 'Install the Amazon Q Extension', // TODO: localize
        iconPath: getIcon('vscode-extensions'),
    })
}

export function createDismissNode() {
    return dismissQTree.build().asTreeNode({
        label: 'Dismiss', // TODO: localize
        iconPath: getIcon('vscode-close'),
    })
}

/*
 * This node is meant to be displayed when the user's active connection is missing scopes required for Amazon Q.
 * For example, users with active CodeWhisperer connections who updates to a toolkit version with Amazon Q (Preview)
 * will be missing these scopes.
 */
export const enableAmazonQNode = () =>
    // Simply trigger re-auth to obtain the proper scopes- same functionality as if requested in the chat window.
    reconnect.build(placeholder, cwTreeNodeSource, true).asTreeNode({
        label: localize('AWS.amazonq.enable', 'Enable'),
        iconPath: getIcon('vscode-debug-start'),
        contextValue: 'awsEnableAmazonQ',
    })
