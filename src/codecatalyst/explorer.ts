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
import { getCodeCatalystDevenvArn } from '../shared/vscode/env'
import { CodeCatalystAuthenticationProvider } from './auth'
import { CodeCatalystCommands } from './commands'
import {
    autoConnect,
    ConnectedWorkspace,
    createClientFactory,
    getConnectedWorkspace,
    getDevfileLocation,
} from './model'

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
        CodeCatalystCommands.declared.openWorkspace.build().asTreeNode({
            label: 'Open Dev Environment',
            iconPath: getIcon('vscode-vm-connect'),
        }),
        CodeCatalystCommands.declared.createWorkspace.build().asTreeNode({
            label: 'Create Dev Environment',
            iconPath: getIcon('vscode-add'),
        }),
        CodeCatalystCommands.declared.listCommands.build().asTreeNode({
            label: 'Show CodeCatalyst Commands',
            iconPath: getIcon('vscode-list-flat'), // TODO(sijaden): use better icon
        }),
    ]
}

function getRemoteCommands(currentWorkspace: DevEnvironment, devfileLocation: vscode.Uri) {
    return [
        CodeCatalystCommands.declared.stopWorkspace.build(currentWorkspace, { showPrompt: true }).asTreeNode({
            label: 'Stop Dev Environment',
            iconPath: getIcon('vscode-stop-circle'),
        }),
        CodeCatalystCommands.declared.openWorkspaceSettings.build().asTreeNode({
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

export function initNodes(ctx: vscode.ExtensionContext): RootNode[] {
    if (isCloud9() && !getCodeCatalystDevenvArn()) {
        return []
    }

    const authProvider = CodeCatalystAuthenticationProvider.fromContext(ctx)

    return [new AuthNode(authProvider), new CodeCatalystRootNode(authProvider)]
}

export class AuthNode implements RootNode {
    public readonly id = 'auth'

    private readonly onDidChangeTreeItemEmitter = new vscode.EventEmitter<void>()
    public readonly onDidChangeTreeItem = this.onDidChangeTreeItemEmitter.event

    public constructor(public readonly resource: CodeCatalystAuthenticationProvider) {
        this.resource.onDidChangeSession(() => this.onDidChangeTreeItemEmitter.fire())
    }

    public async getTreeItem() {
        await autoConnect(this.resource)
        const account = this.resource.activeAccount

        if (account !== undefined) {
            const item = new vscode.TreeItem(account.label)
            item.iconPath = getIcon('vscode-account')

            return item
        }

        const loginNode = CodeCatalystCommands.declared.login.build().asTreeNode({
            label: 'Login...',
            iconPath: getIcon('vscode-account'),
        })

        return loginNode.getTreeItem()
    }
}

export class CodeCatalystRootNode implements RootNode {
    public readonly id = 'codecatalyst'
    public readonly resource = this.workspace

    private readonly onDidChangeEmitter = new vscode.EventEmitter<void>()

    public readonly onDidChangeVisibility = this.onDidChangeEmitter.event
    public readonly onDidChangeTreeItem = this.onDidChangeEmitter.event
    public readonly onDidChangeChildren = this.onDidChangeEmitter.event

    private workspace?: ConnectedWorkspace

    public constructor(private readonly authProvider: CodeCatalystAuthenticationProvider) {
        this.authProvider.onDidChangeSession(() => this.onDidChangeEmitter.fire())
    }

    public canShow(): boolean {
        return !!this.authProvider.activeAccount
    }

    public async getChildren(): Promise<TreeNode[]> {
        if (!this.workspace) {
            return getLocalCommands()
        }

        const devfileLocation = await getDevfileLocation(this.workspace.workspaceClient)

        return getRemoteCommands(this.workspace.summary, devfileLocation)
    }

    public async getTreeItem() {
        const item = new vscode.TreeItem('CodeCatalyst', vscode.TreeItemCollapsibleState.Collapsed)
        this.workspace = await this.getWorkspace()

        if (this.workspace !== undefined) {
            item.description = 'Connected to Dev Environment'
            item.iconPath = addColor(getIcon('vscode-pass'), 'testing.iconPassed')
        }

        return item
    }

    private async getWorkspace() {
        const client = await createClientFactory(this.authProvider)()
        return client.connected ? getConnectedWorkspace(client) : undefined
    }
}
