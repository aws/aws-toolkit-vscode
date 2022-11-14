/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { RootNode } from '../awsexplorer/localExplorer'
import { createBuilderIdConnection, isBuilderIdConnection } from '../credentials/auth'
import { DevEnvironment } from '../shared/clients/codecatalystClient'
import { UnknownError } from '../shared/errors'
import { isCloud9 } from '../shared/extensionUtilities'
import { addColor, getIcon } from '../shared/icons'
import { getLogger } from '../shared/logger/logger'
import { TreeNode } from '../shared/treeview/resourceTreeDataProvider'
import { showQuickPick } from '../shared/ui/pickerPrompter'
import { Commands } from '../shared/vscode/commands2'
import { CodeCatalystAuthenticationProvider } from './auth'
import { CodeCatalystCommands } from './commands'
import { ConnectedDevEnv, createClientFactory, getConnectedDevEnv, getDevfileLocation } from './model'

const saveConnectionItem = {
    label: 'Yes, save this connection to this tool',
    detail: 'This can be removed by selecting "Remove Connection from Tool" on the CodeCatalyst node.',
    data: 'yes',
} as const

const useConnectionItem = {
    label: 'No, use this connection for everything',
    detail: 'This will not log you out; you can switch back at any point by selecting the profile name.',
    data: 'no',
} as const

const getStartedCommand = Commands.register(
    'aws.codecatalyst.getStarted',
    async (authProvider: CodeCatalystAuthenticationProvider) => {
        const auth = authProvider.auth
        const conn = await createBuilderIdConnection(auth)

        if (auth.activeConnection !== undefined && !isBuilderIdConnection(auth.activeConnection)) {
            const resp = await showQuickPick([saveConnectionItem, useConnectionItem], {
                title: `Use ${conn.label} for CodeCatalyst?`,
            })
            if (resp === 'yes') {
                await authProvider.setSavedConnection(conn)
            } else {
                await auth.useConnection(conn)
            }
        }
    }
)

const learnMoreCommand = Commands.register('aws.learnMore', async (docsUrl: vscode.Uri) => {
    return vscode.env.openExternal(docsUrl)
})

// FIXME: use the correct url
const codecatalystDocsUrl = vscode.Uri.parse(
    'https://docs.aws.amazon.com/toolkit-for-vscode/latest/userguide/welcome.html'
)

function getLocalCommands(auth: CodeCatalystAuthenticationProvider) {
    if (!isBuilderIdConnection(auth.activeConnection)) {
        return [
            getStartedCommand.build(auth).asTreeNode({
                label: 'Get Started...',
                iconPath: getIcon('vscode-rocket'),
            }),
            learnMoreCommand.build(codecatalystDocsUrl).asTreeNode({
                label: 'Learn more about CodeCatalyst',
                iconPath: getIcon('vscode-lightbulb'),
            }),
        ]
    }

    const cmds = [
        CodeCatalystCommands.declared.cloneRepo.build().asTreeNode({
            label: 'Clone Repository',
            iconPath: getIcon('vscode-symbol-namespace'),
        }),
    ]

    if (isCloud9()) {
        return cmds
    }

    return [
        ...cmds,
        CodeCatalystCommands.declared.openDevEnv.build().asTreeNode({
            label: 'Open Dev Environment',
            iconPath: getIcon('vscode-vm-connect'),
        }),
        CodeCatalystCommands.declared.createDevEnv.build().asTreeNode({
            label: 'Create Dev Environment',
            iconPath: getIcon('vscode-add'),
        }),
        CodeCatalystCommands.declared.listCommands.build().asTreeNode({
            label: 'Show CodeCatalyst Commands',
            iconPath: getIcon('vscode-list-flat'), // TODO(sijaden): use better icon
        }),
    ]
}

function getRemoteCommands(currentDevEnv: DevEnvironment, devfileLocation: vscode.Uri) {
    return [
        CodeCatalystCommands.declared.stopDevEnv.build(currentDevEnv, { showPrompt: true }).asTreeNode({
            label: 'Stop Dev Environment',
            iconPath: getIcon('vscode-stop-circle'),
        }),
        CodeCatalystCommands.declared.openDevEnvSettings.build().asTreeNode({
            label: 'Open Settings',
            iconPath: getIcon('vscode-settings-gear'),
        }),
        CodeCatalystCommands.declared.openDevfile.build(devfileLocation).asTreeNode({
            label: 'Open Devfile',
            iconPath: getIcon('vscode-symbol-namespace'),
            description: vscode.workspace.asRelativePath(devfileLocation),
        }),
    ]
}

export class CodeCatalystRootNode implements RootNode {
    public readonly id = 'codecatalyst'
    public readonly resource = this.devenv

    private readonly onDidChangeEmitter = new vscode.EventEmitter<void>()

    public readonly onDidChangeVisibility = this.onDidChangeEmitter.event
    public readonly onDidChangeTreeItem = this.onDidChangeEmitter.event
    public readonly onDidChangeChildren = this.onDidChangeEmitter.event

    private devenv?: ConnectedDevEnv

    public constructor(private readonly authProvider: CodeCatalystAuthenticationProvider) {
        this.authProvider.onDidChangeActiveConnection(() => this.onDidChangeEmitter.fire())
    }

    public async getChildren(): Promise<TreeNode[]> {
        if (!this.devenv) {
            return getLocalCommands(this.authProvider)
        }

        const devfileLocation = await getDevfileLocation(this.devenv.devenvClient)

        return getRemoteCommands(this.devenv.summary, devfileLocation)
    }

    public async getTreeItem() {
        this.devenv = await this.getDevEnv()

        const item = new vscode.TreeItem('CodeCatalyst', vscode.TreeItemCollapsibleState.Collapsed)
        item.contextValue = this.authProvider.isUsingSavedConnection
            ? 'awsCodeCatalystNodeSaved'
            : 'awsCodeCatalystNode'

        if (this.devenv !== undefined) {
            item.description = 'Connected to Dev Environment'
            item.iconPath = addColor(getIcon('vscode-pass'), 'testing.iconPassed')
        } else {
            item.description = this.authProvider.isUsingSavedConnection ? 'AWS Builder ID connected' : undefined
        }

        return item
    }

    private async getDevEnv() {
        try {
            const client = await createClientFactory(this.authProvider)()
            return client.connected ? await getConnectedDevEnv(client) : undefined
        } catch (err) {
            getLogger().warn(`codecatalyst: failed to get Dev Environment: ${UnknownError.cast(err).message}`)
        }
    }
}
