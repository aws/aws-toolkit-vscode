/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { RootNode } from '../awsexplorer/localExplorer'
import { DevelopmentWorkspace } from '../shared/clients/cawsClient'
import { isCloud9 } from '../shared/extensionUtilities'
import { addColor, getIcon } from '../shared/icons'
import { TreeNode } from '../shared/treeview/resourceTreeDataProvider'
import { getCawsWorkspaceArn } from '../shared/vscode/env'
import { CawsAuthenticationProvider } from './auth'
import { CawsCommands } from './commands'
import {
    autoConnect,
    ConnectedWorkspace,
    createClientFactory,
    getConnectedWorkspace,
    getDevfileLocation,
} from './model'

function getLocalCommands() {
    const cmds = [
        CawsCommands.declared.cloneRepo.build().asTreeNode({
            label: 'Clone Repository',
            iconPath: getIcon('vscode-symbol-namespace'),
        }),
    ]

    if (isCloud9()) {
        return cmds
    }

    return [
        ...cmds,
        CawsCommands.declared.openWorkspace.build().asTreeNode({
            label: 'Open Workspace',
            iconPath: getIcon('vscode-vm-connect'),
        }),
        CawsCommands.declared.createWorkspace.build().asTreeNode({
            label: 'Create Workspace',
            iconPath: getIcon('vscode-add'),
        }),
        CawsCommands.declared.listCommands.build().asTreeNode({
            label: 'Show REMOVED.codes Commands',
            iconPath: getIcon('vscode-list-flat'), // TODO(sijaden): use better icon
        }),
    ]
}

function getRemoteCommands(currentWorkspace: DevelopmentWorkspace, devfileLocation: vscode.Uri) {
    return [
        CawsCommands.declared.stopWorkspace.build(currentWorkspace).asTreeNode({
            label: 'Stop Workspace',
            iconPath: getIcon('vscode-stop-circle'),
        }),
        CawsCommands.declared.openWorkspaceSettings.build().asTreeNode({
            label: 'Open Settings',
            iconPath: getIcon('vscode-settings-gear'),
        }),
        CawsCommands.declared.openDevfile.build(devfileLocation).asTreeNode({
            label: 'Open Devfile',
            iconPath: getIcon('vscode-symbol-namespace'),
            description: vscode.workspace.asRelativePath(devfileLocation),
        }),
    ]
}

export function initNodes(ctx: vscode.ExtensionContext): RootNode[] {
    if (isCloud9() && !getCawsWorkspaceArn()) {
        return []
    }

    const authProvider = CawsAuthenticationProvider.fromContext(ctx)

    return [new AuthNode(authProvider), new CawsRootNode(authProvider)]
}

export class AuthNode implements RootNode {
    public readonly id = 'auth'

    private readonly onDidChangeTreeItemEmitter = new vscode.EventEmitter<void>()
    public readonly onDidChangeTreeItem = this.onDidChangeTreeItemEmitter.event

    public constructor(public readonly resource: CawsAuthenticationProvider) {
        this.resource.onDidChangeSessions(() => this.onDidChangeTreeItemEmitter.fire())
    }

    public async getTreeItem() {
        await autoConnect(this.resource)
        const session = this.resource.getActiveSession()

        if (session !== undefined) {
            const item = new vscode.TreeItem(session.accountDetails.label)
            item.iconPath = getIcon('vscode-account')

            return item
        }

        const loginNode = CawsCommands.declared.login.build().asTreeNode({
            label: 'Login...',
            iconPath: getIcon('vscode-account'),
        })

        return loginNode.getTreeItem()
    }
}

export class CawsRootNode implements RootNode {
    public readonly id = 'caws'
    public readonly resource = this.workspace

    private readonly onDidChangeEmitter = new vscode.EventEmitter<void>()

    public readonly onDidChangeVisibility = this.onDidChangeEmitter.event
    public readonly onDidChangeTreeItem = this.onDidChangeEmitter.event
    public readonly onDidChangeChildren = this.onDidChangeEmitter.event

    private workspace?: ConnectedWorkspace

    public constructor(private readonly authProvider: CawsAuthenticationProvider) {
        this.authProvider.onDidChangeSessions(() => this.onDidChangeEmitter.fire())
    }

    public canShow(): boolean {
        return !!this.authProvider.getActiveSession()
    }

    public async getChildren(): Promise<TreeNode[]> {
        if (!this.workspace) {
            return getLocalCommands()
        }

        const devfileLocation = await getDevfileLocation(this.workspace.workspaceClient)

        return getRemoteCommands(this.workspace.summary, devfileLocation)
    }

    public async getTreeItem() {
        const item = new vscode.TreeItem('REMOVED.codes', vscode.TreeItemCollapsibleState.Collapsed)
        this.workspace = await this.getWorkspace()

        if (this.workspace !== undefined) {
            item.description = 'Connected to Workspace'
            item.iconPath = addColor(getIcon('vscode-pass'), 'testing.iconPassed')
        }

        return item
    }

    private async getWorkspace() {
        const client = await createClientFactory(this.authProvider)()
        return client.connected ? getConnectedWorkspace(client) : undefined
    }
}
