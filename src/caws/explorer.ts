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
import { CawsAuthenticationProvider } from './auth'
import { CawsCommands } from './commands'
import { ConnectedWorkspace, createClientFactory, getConnectedWorkspace, getDevfileLocation } from './model'

function getLocalCommands() {
    if (isCloud9()) {
        return []
    }

    return [
        CawsCommands.declared.cloneRepo.build().asTreeNode({
            label: 'Clone Repository',
            iconPath: getIcon('vscode-symbol-namespace'),
        }),
        CawsCommands.declared.openWorkspace.build().asTreeNode({
            label: 'Open Workspace',
            iconPath: getIcon('vscode-vm-connect'),
        }),
        CawsCommands.declared.createWorkspace.build().asTreeNode({
            label: 'Create Workspace',
            iconPath: getIcon('vscode-add'),
        }),
        CawsCommands.declared.listCommands.build().asTreeNode({
            label: 'View Additional REMOVED.codes Commands',
            iconPath: getIcon('vscode-list-flat'), // TODO(sijaden): use better icon
        }),
    ]
}

function getRemoteCommands(currentWorkspace: DevelopmentWorkspace, devFileLocation: vscode.Uri) {
    return [
        CawsCommands.declared.stopWorkspace.build(currentWorkspace).asTreeNode({
            label: 'Stop Workspace',
            iconPath: getIcon('vscode-stop-circle'),
        }),
        CawsCommands.declared.openWorkspaceSettings.build().asTreeNode({
            label: 'Open Settings',
            iconPath: getIcon('vscode-settings-gear'),
        }),
        CawsCommands.declared.openDevfile.build(devFileLocation).asTreeNode({
            label: 'Open Devfile',
            iconPath: getIcon('vscode-symbol-namespace'),
            description: vscode.workspace.asRelativePath(devFileLocation),
        }),
    ]
}

export function initNodes(ctx: vscode.ExtensionContext): RootNode[] {
    const authProvider = CawsAuthenticationProvider.fromContext(ctx)

    return [new AuthNode(authProvider), new CawsRootNode(authProvider)]
}

export class AuthNode implements RootNode {
    public readonly id = 'auth'

    public constructor(public readonly resource: CawsAuthenticationProvider) {}

    public get treeItem() {
        return this.createTreeItem()
    }

    private createTreeItem() {
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

        return loginNode.treeItem
    }
}

export class CawsRootNode implements RootNode {
    public readonly id = 'caws'
    public readonly resource = this.workspace

    private readonly onDidChangeVisibilityEmitter = new vscode.EventEmitter<void>()
    public readonly onDidChangeVisibility = this.onDidChangeVisibilityEmitter.event

    private workspace?: ConnectedWorkspace

    public constructor(private readonly authProvider: CawsAuthenticationProvider) {
        this.authProvider.onDidChangeSessions(async () => {
            this.workspace = await this.getWorkspace()
            this.onDidChangeVisibilityEmitter.fire()
        })

        this.getWorkspace().then(workspace => {
            this.workspace = workspace
            this.onDidChangeVisibilityEmitter.fire()
        })
    }

    public get treeItem() {
        return this.createTreeItem()
    }

    public canShow(): boolean {
        return !!this.authProvider.getActiveSession()
    }

    public async getChildren(): Promise<TreeNode[]> {
        if (!this.workspace) {
            return getLocalCommands()
        }

        const devFileLocation = await getDevfileLocation(this.workspace.workspaceClient)

        return getRemoteCommands(this.workspace.summary, devFileLocation)
    }

    private createTreeItem() {
        const item = new vscode.TreeItem('REMOVED.codes', vscode.TreeItemCollapsibleState.Collapsed)

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
