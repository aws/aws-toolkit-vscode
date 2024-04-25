/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { Commands } from '../../shared/vscode/commands2'
import { getIcon } from '../../shared/icons'
import { installAmazonQExtension } from '../../codewhisperer/commands/basicCommands'
import { amazonQHelpUrl } from '../../shared/constants'
import { cwTreeNodeSource } from '../../codewhisperer/commands/types'
import { VSCODE_EXTENSION_ID } from '../../shared/extensions'
import { globals } from '../../shared'
import { amazonQDismissedKey } from '../../codewhisperer/models/constants'
import { ExtStartUpSources, telemetry } from '../../shared/telemetry'
import { ExtensionUse } from '../../auth/utils'

const localize = nls.loadMessageBundle()

export const learnMoreAmazonQCommand = Commands.declare('aws.toolkit.amazonq.learnMore', () => () => {
    void vscode.env.openExternal(vscode.Uri.parse(amazonQHelpUrl))
})

export const qExtensionPageCommand = Commands.declare('aws.toolkit.amazonq.extensionpage', () => () => {
    void vscode.env.openExternal(vscode.Uri.parse(`vscode:extension/${VSCODE_EXTENSION_ID.amazonq}`))
})

export const dismissQTree = Commands.declare(
    { id: '_aws.toolkit.amazonq.dismiss', compositeKey: { 0: 'source' } },
    () => async (source: string) => {
        await telemetry.toolkit_invokeAction.run(async () => {
            telemetry.record({
                source: ExtensionUse.instance.isFirstUse() ? ExtStartUpSources.firstStartUp : ExtStartUpSources.none,
            })

            await globals.context.globalState.update(amazonQDismissedKey, true)
            await vscode.commands.executeCommand('setContext', amazonQDismissedKey, true)

            telemetry.record({ action: 'dismissQExplorerTree' })
        })
    }
)

// Learn more button of Amazon Q now opens the Amazon Q marketplace page.
export const createLearnMoreNode = () =>
    qExtensionPageCommand.build().asTreeNode({
        label: localize('AWS.amazonq.learnMore', 'Learn More About Amazon Q'),
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
    return dismissQTree.build(cwTreeNodeSource).asTreeNode({
        label: 'Dismiss', // TODO: localize
        iconPath: getIcon('vscode-close'),
    })
}
