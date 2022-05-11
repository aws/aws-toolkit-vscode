/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { CawsDevEnv } from '../shared/clients/cawsClient'
import { AWSTreeNodeBase } from '../shared/treeview/nodes/awsTreeNodeBase'
import { createThemeIcon, makeChildrenNodes } from '../shared/treeview/utils'
import { CawsAuthenticationProvider } from './auth'
import { CawsCommands } from './commands'
import { ConnectedWorkspace, createClientFactory, getConnectedWorkspace, getDevFileLocation } from './model'

const localCommands = [
    CawsCommands.declared.cloneRepo.build().asTreeNode({
        label: 'Clone Repository',
        iconPath: createThemeIcon('symbol-namespace'),
    }),
    CawsCommands.declared.openWorkspace.build().asTreeNode({
        label: 'Open Workspace',
        iconPath: createThemeIcon('vm-connect'),
    }),
    CawsCommands.declared.listCommands.build().asTreeNode({
        label: 'View Additional Code.AWS Commands',
        iconPath: createThemeIcon('list-flat'), // TODO(sijaden): use better icon
    }),
]

function getRemoteCommands(currentWorkspace: CawsDevEnv, devFileLocation: vscode.Uri) {
    return [
        CawsCommands.declared.stopWorkspace.build(currentWorkspace).asTreeNode({
            label: 'Stop Workspace',
            iconPath: createThemeIcon('stop-circle'),
        }),
        CawsCommands.declared.openWorkspaceSettings.build().asTreeNode({
            label: 'Open Settings',
            iconPath: createThemeIcon('settings-gear'),
        }),
        CawsCommands.declared.openDevFile.build(devFileLocation).asTreeNode({
            label: 'Open DevFile',
            iconPath: createThemeIcon('symbol-namespace'),
            description: vscode.workspace.asRelativePath(devFileLocation),
        }),
    ]
}

export class CawsRootNode extends AWSTreeNodeBase {
    public readonly id = 'caws'
    public readonly type = 'service'

    public constructor(private readonly workspace?: ConnectedWorkspace) {
        super('CODE.AWS', vscode.TreeItemCollapsibleState.Collapsed)

        if (this.workspace !== undefined) {
            this.description = 'Connected to Workspace'
            this.iconPath = createThemeIcon('pass', 'testing.iconPassed')
        }
    }

    public async getChildren(): Promise<AWSTreeNodeBase[]> {
        if (!this.workspace) {
            return localCommands
        }

        const devFileLocation = await getDevFileLocation(this.workspace.environmentClient)

        return getRemoteCommands(this.workspace.summary, devFileLocation)
    }
}

// Placing 'DeveloperTools' in this file until it makes sense to split it up
// TODO(sijaden): get rid of `AWSTreeNodeBase`, replace with an interface compatible with all UI

export class DeveloperToolsView implements vscode.TreeDataProvider<AWSTreeNodeBase> {
    public static readonly viewId = 'aws.developerTools'

    private readonly onDidChangeEmitter = new vscode.EventEmitter<AWSTreeNodeBase | void>()
    public readonly onDidChangeTreeData = this.onDidChangeEmitter.event

    public constructor(private readonly authProvider: CawsAuthenticationProvider) {
        this.authProvider.onDidChangeSessions(() => this.onDidChangeEmitter.fire())
    }

    public getTreeItem(element: AWSTreeNodeBase): AWSTreeNodeBase {
        return element
    }

    public getChildren(element?: AWSTreeNodeBase): Promise<AWSTreeNodeBase[]> {
        return makeChildrenNodes({
            getChildNodes: async () => {
                if (!element) {
                    const authNode = this.getAuthNode()
                    const cawsNode = await this.getCawsNode()

                    return cawsNode ? [authNode, cawsNode] : [authNode]
                }

                return element.getChildren()
            },
        })
    }

    private getAuthNode() {
        const session = this.authProvider.getActiveSession()

        if (session !== undefined) {
            return new (class extends AWSTreeNodeBase {
                public constructor(label: string) {
                    super(label, vscode.TreeItemCollapsibleState.None)
                    this.iconPath = createThemeIcon('account')
                }
            })(session.accountDetails.label)
        }

        return CawsCommands.declared.login.build().asTreeNode({
            label: 'Login...',
            iconPath: createThemeIcon('account'),
        })
    }

    private async getCawsNode() {
        const client = await createClientFactory(this.authProvider)()

        if (client.connected) {
            const devWorkspace = client.connected ? await getConnectedWorkspace(client) : undefined

            return new CawsRootNode(devWorkspace)
        }

        // Should we show a placeholder when not connected?
    }
}
