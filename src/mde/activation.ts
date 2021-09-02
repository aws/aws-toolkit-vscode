/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ExtContext } from '../shared/extensions'
import { MdeDevfileCodeLensProvider } from '../shared/codelens/devfileCodeLensProvider'
import { DevfileRegistry, DEVFILE_GLOB_PATTERN } from '../shared/fs/devfileRegistry'
import { localize } from '../shared/utilities/messages'
import { mdeConnectCommand, mdeCreateCommand } from './mdeCommands'
import { MdeInstanceNode } from './mdeInstanceNode'
import { MdeRootNode } from './mdeRootNode'
import * as localizedText from '../shared/localizedText'
// import * as mde from '../shared/clients/mdeClient'

/**
 * Activates MDE functionality.
 */
export async function activate(ctx: ExtContext): Promise<void> {
    await registerCommands(ctx)

    const devfileRegistry = new DevfileRegistry()
    await devfileRegistry.addWatchPattern(DEVFILE_GLOB_PATTERN)

    ctx.extensionContext.subscriptions.push(
        vscode.languages.registerCodeLensProvider(
            {
                language: 'yaml',
                scheme: 'file',
                pattern: DEVFILE_GLOB_PATTERN,
            },
            new MdeDevfileCodeLensProvider()
        )
    ),
        vscode.workspace.onDidSaveTextDocument(async (doc: vscode.TextDocument) => {
            if (doc && devfileRegistry.getRegisteredItem(doc.fileName)) {
                // TODO: placeholder - detect we are in environment and wire up update command
                await vscode.window.showInformationMessage(
                    localize('AWS.mde.devfile.updatePrompt', 'Update the current environment with this Devfile?'),
                    localizedText.yes,
                    localizedText.no
                )
            }
        })
}

async function registerCommands(ctx: ExtContext): Promise<void> {
    ctx.extensionContext.subscriptions.push(
        vscode.commands.registerCommand('aws.mde.connect', async (treenode: MdeInstanceNode) => {
            mdeConnectCommand(treenode.env)
        })
    )
    ctx.extensionContext.subscriptions.push(
        vscode.commands.registerCommand('aws.mde.create', async (treenode: MdeRootNode) => {
            mdeCreateCommand(treenode)
        })
    )
}
