/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { createFreeTierLimitMet, createSignIn, createReconnect } from '../../codewhisperer/ui/codeWhispererNodes'
import { ResourceTreeDataProvider, TreeNode } from '../../shared/treeview/resourceTreeDataProvider'
import { AuthUtil, amazonQScopes, codeWhispererChatScopes, isPreviousQUser } from '../../codewhisperer/util/authUtil'
import {
    createLearnMoreNode,
    enableAmazonQNode,
    switchToAmazonQNode,
    createInstallQNode,
    createDismissNode,
} from './amazonQChildrenNodes'
import { Command, Commands } from '../../shared/vscode/commands2'
import { hasScopes, isSsoConnection } from '../../auth/connection'
import { listCodeWhispererCommands } from '../../codewhisperer/ui/statusBarMenu'
import { getIcon } from '../../shared/icons'
import { vsCodeState } from '../../codewhisperer/models/model'
import { DevSettings } from '../../shared/settings'
import { isExtensionActive } from '../../shared/utilities/vsCodeUtils'
import { VSCODE_EXTENSION_ID } from '../../shared/extensions'

export class AmazonQNode implements TreeNode {
    public readonly id = 'amazonq'
    public readonly resource = this
    private readonly onDidChangeChildrenEmitter = new vscode.EventEmitter<void>()
    private readonly onDidChangeTreeItemEmitter = new vscode.EventEmitter<void>()
    public readonly onDidChangeTreeItem = this.onDidChangeTreeItemEmitter.event
    public readonly onDidChangeChildren = this.onDidChangeChildrenEmitter.event
    private readonly onDidChangeVisibilityEmitter = new vscode.EventEmitter<void>()
    public readonly onDidChangeVisibility = this.onDidChangeVisibilityEmitter.event

    constructor() {}

    public getTreeItem() {
        const item = new vscode.TreeItem('Amazon Q')
        item.description = this.getDescription()
        item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed
        item.contextValue = AuthUtil.instance.isUsingSavedConnection ? 'awsAmazonQNodeSaved' : 'awsAmazonQNode'

        return item
    }

    public refresh(): void {
        this.onDidChangeChildrenEmitter.fire()
    }

    public refreshRootNode() {
        this.onDidChangeTreeItemEmitter.fire()
    }

    private getDescription(): string {
        void vscode.commands.executeCommand('setContext', 'gumby.isTransformAvailable', false)
        if (AuthUtil.instance.isConnectionValid()) {
            if (AuthUtil.instance.isEnterpriseSsoInUse()) {
                void vscode.commands.executeCommand('setContext', 'gumby.isTransformAvailable', true)
                return 'IAM Identity Center Connected'
            } else if (AuthUtil.instance.isBuilderIdInUse()) {
                return 'AWS Builder ID Connected'
            } else {
                return 'IAM Connected'
            }
        } else if (AuthUtil.instance.isConnectionExpired()) {
            return 'Expired Connection'
        }
        return ''
    }

    public getChildren() {
        if (DevSettings.instance.get('forceStandaloneExt', false) && !isExtensionActive(VSCODE_EXTENSION_ID.amazonq)) {
            const children = [createInstallQNode(), createLearnMoreNode()]
            if (!isPreviousQUser()) {
                children.push(createDismissNode())
            }
            return children
        } else {
            if (AuthUtil.instance.isConnectionExpired()) {
                return [createReconnect('tree'), createLearnMoreNode()]
            }

            if (!AuthUtil.instance.isConnected()) {
                return [createSignIn('tree'), createLearnMoreNode()]
            }

            if (isSsoConnection(AuthUtil.instance.conn)) {
                const missingScopes =
                    (AuthUtil.instance.isEnterpriseSsoInUse() && !hasScopes(AuthUtil.instance.conn, amazonQScopes)) ||
                    !hasScopes(AuthUtil.instance.conn, codeWhispererChatScopes)

                if (missingScopes) {
                    return [enableAmazonQNode(), createLearnMoreNode()]
                }
            }

            return [
                vsCodeState.isFreeTierLimitReached ? createFreeTierLimitMet('tree') : switchToAmazonQNode('tree'),
                createNewMenuButton(),
            ]
        }
    }

    /**
     * HACK: Since this is assumed to be an immediate child of the
     * root, we return undefined.
     *
     * TODO: Look to have a base root class to extend so we do not
     * need to implement this here.
     * @returns
     */
    getParent(): TreeNode<unknown> | undefined {
        return undefined
    }
}

function createNewMenuButton(): TreeNode<Command> {
    return listCodeWhispererCommands.build().asTreeNode({
        label: 'New: Menu moved to status bar',
        iconPath: getIcon('vscode-megaphone'),
        description: 'Learn more',
    })
}

export const amazonQNode = new AmazonQNode()
export const refreshAmazonQ = (provider?: ResourceTreeDataProvider) =>
    Commands.register({ id: 'aws.amazonq.refresh', logging: false }, () => {
        amazonQNode.refresh()
        if (provider) {
            provider.refresh()
        }
    })

export const refreshAmazonQRootNode = (provider?: ResourceTreeDataProvider) =>
    Commands.register({ id: 'aws.amazonq.refreshRootNode', logging: false }, () => {
        amazonQNode.refreshRootNode()
        if (provider) {
            provider.refresh()
        }
    })
