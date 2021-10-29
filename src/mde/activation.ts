/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ExtContext } from '../shared/extensions'
import { MdeDevfileCodeLensProvider } from '../shared/codelens/devfileCodeLensProvider'
import { DevfileRegistry, DEVFILE_GLOB_PATTERN } from '../shared/fs/devfileRegistry'
import { localize } from '../shared/utilities/messages'
import { mdeConnectCommand, mdeCreateCommand, mdeDeleteCommand, tagMde, resumeEnvironments } from './mdeCommands'
import { MdeInstanceNode } from './mdeInstanceNode'
import { MdeRootNode } from './mdeRootNode'
import * as localizedText from '../shared/localizedText'
import { activateUriHandlers } from './mdeUriHandlers'
import { getLogger } from '../shared/logger'
import { GitExtension } from '../shared/extensions/git'
import { createTagMapFromRepo } from './mdeModel'
import { createMdeConfigureWebview } from './vue/configure/backend'
import { DefaultMdeEnvironmentClient } from '../shared/clients/mdeEnvironmentClient'
import { MDE_RESTART_KEY } from './constants'
import { initStatusBar } from './mdeStatusBarItem'
import { getMdeEnvArn } from '../shared/vscode/env'

/**
 * Activates MDE functionality.
 */
export async function activate(ctx: ExtContext): Promise<void> {
    const client = new DefaultMdeEnvironmentClient()
    await registerCommands(ctx)

    const devfileRegistry = new DevfileRegistry()
    await devfileRegistry.addWatchPattern(DEVFILE_GLOB_PATTERN)

    const arn = getMdeEnvArn()
    if (arn) {
        const git = GitExtension.instance
        const repos = git.repositories
        // assume that only 1 repository is open for now
        if (repos.length > 0) {
            // need to pull from the repo (and ignore branch) in order to get a remote url
            repos[0].onDidChangeBranch(async branch => {
                const tags = await createTagMapFromRepo(repos[0])
                await tagMde(arn, tags)
            })
        }
        initStatusBar()
    }

    ctx.extensionContext.subscriptions.push(
        vscode.languages.registerCodeLensProvider(
            {
                language: 'yaml',
                scheme: 'file',
                pattern: DEVFILE_GLOB_PATTERN,
            },
            new MdeDevfileCodeLensProvider()
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
    )

    activateUriHandlers(ctx, ctx.uriHandler)

    // Namespacing the clause context since I believe they are shared across extensions
    vscode.commands.executeCommand('setContext', 'aws.isMde', !!client.arn)

    handleRestart(ctx)
}

function handleRestart(ctx: ExtContext) {
    const envClient = new DefaultMdeEnvironmentClient()
    if (envClient.arn !== undefined) {
        // Remove this environment
        const memento = ctx.extensionContext.globalState
        const pendingRestarts = memento.get<Record<string, boolean>>(MDE_RESTART_KEY, {})
        delete pendingRestarts[envClient.arn.split('/').pop() ?? '']
        memento.update(MDE_RESTART_KEY, pendingRestarts)
    } else {
        // Resume environments (if coming from a restart)
        resumeEnvironments(ctx).catch(err => {
            getLogger().error(`Error while resuming environments: ${err}`)
        })
    }
}

async function registerCommands(ctx: ExtContext): Promise<void> {
    ctx.extensionContext.subscriptions.push(
        vscode.commands.registerCommand('aws.mde.connect', async (treenode: MdeInstanceNode) => {
            mdeConnectCommand(treenode.env, treenode.parent.regionCode)
        })
    )
    ctx.extensionContext.subscriptions.push(
        vscode.commands.registerCommand('aws.mde.create', async (treenode: MdeRootNode) => {
            mdeCreateCommand(treenode, undefined, ctx)
        })
    )
    ctx.extensionContext.subscriptions.push(
        vscode.commands.registerCommand('aws.mde.delete', async (treenode: MdeInstanceNode) => {
            if (!treenode) {
                getLogger().warn('aws.mde.delete: got null treenode')
                return
            }
            // TODO: refresh explorer and poll
            mdeDeleteCommand(treenode.env, treenode.parent)
        })
    )
    ctx.extensionContext.subscriptions.push(
        vscode.commands.registerCommand('aws.mde.configure', async (treenode: MdeInstanceNode) => {
            createMdeConfigureWebview(ctx, treenode.env.id)
        })
    )
    // TODO: may be better to pass an explicit variable saying this is the MDE we're connected to
    ctx.extensionContext.subscriptions.push(
        vscode.commands.registerCommand('aws.mde.configure.current', async () => {
            createMdeConfigureWebview(ctx)
        })
    )
}
