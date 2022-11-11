/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { RootNode } from '../awsexplorer/localExplorer'
import { DevEnvironment } from '../shared/clients/codecatalystClient'
import { isCloud9 } from '../shared/extensionUtilities'
import { addColor, getIcon } from '../shared/icons'
import { TreeNode } from '../shared/treeview/resourceTreeDataProvider'
import { CodeCatalystAuthenticationProvider } from './auth'
import { CodeCatalystCommands } from './commands'
import { ConnectedDevEnv, createClientFactory, getConnectedDevEnv, getDevfileLocation } from './model'

function getLocalCommands() {
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
        this.authProvider.onDidChangeSession(() => this.onDidChangeEmitter.fire())
    }

    public canShow(): boolean {
        return !!this.authProvider.activeAccount
    }

    public async getChildren(): Promise<TreeNode[]> {
        if (!this.devenv) {
            return getLocalCommands()
        }

        const devfileLocation = await getDevfileLocation(this.devenv.devenvClient)

        return getRemoteCommands(this.devenv.summary, devfileLocation)
    }

    public async getTreeItem() {
        const item = new vscode.TreeItem('CodeCatalyst', vscode.TreeItemCollapsibleState.Collapsed)
        this.devenv = await this.getDevEnv()

        if (this.devenv !== undefined) {
            item.description = 'Connected to Dev Environment'
            item.iconPath = addColor(getIcon('vscode-pass'), 'testing.iconPassed')
        }

        return item
    }

    private async getDevEnv() {
        const client = await createClientFactory(this.authProvider)()
        return client.connected ? getConnectedDevEnv(client) : undefined
    }
}
