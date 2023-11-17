/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import {
    createFreeTierLimitMet,
    createSignIn,
    createReconnect,
} from '../../codewhisperer/explorer/codewhispererChildrenNodes'
import { RootNode } from '../../awsexplorer/localExplorer'
import { TreeNode } from '../../shared/treeview/resourceTreeDataProvider'
import { AuthUtil } from '../../codewhisperer/util/authUtil'
import { createLearnMoreNode, createTransformByQ, switchToAmazonQNode } from './amazonQChildrenNodes'
import { Commands } from '../../shared/vscode/commands2'

export class AmazonQNode implements RootNode {
    public readonly id = 'amazonq'
    public readonly resource = this
    private readonly onDidChangeChildrenEmitter = new vscode.EventEmitter<void>()
    private readonly onDidChangeTreeItemEmitter = new vscode.EventEmitter<void>()
    public readonly onDidChangeTreeItem = this.onDidChangeTreeItemEmitter.event
    public readonly onDidChangeChildren = this.onDidChangeChildrenEmitter.event
    private readonly onDidChangeVisibilityEmitter = new vscode.EventEmitter<void>()
    public readonly onDidChangeVisibility = this.onDidChangeVisibilityEmitter.event
    private _showFreeTierLimitReachedNode = false

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
        vscode.commands.executeCommand('setContext', 'gumby.isTransformAvailable', false)
        if (AuthUtil.instance.isConnectionValid()) {
            if (AuthUtil.instance.isEnterpriseSsoInUse()) {
                vscode.commands.executeCommand('setContext', 'gumby.isTransformAvailable', true)
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
        vscode.commands.executeCommand('setContext', 'gumby.isTransformAvailable', false)
        if (AuthUtil.instance.isConnectionExpired()) {
            return [createReconnect('tree'), createLearnMoreNode()]
        }
        if (!AuthUtil.instance.isConnected()) {
            return [createSignIn('tree'), createLearnMoreNode()]
        }
        if (this._showFreeTierLimitReachedNode) {
            return [createFreeTierLimitMet('tree')]
        } else {
            // logged in
            if (AuthUtil.instance.isConnectionValid() && AuthUtil.instance.isEnterpriseSsoInUse()) {
                vscode.commands.executeCommand('setContext', 'gumby.isTransformAvailable', true)
                return [switchToAmazonQNode(), createTransformByQ()] // transform only available for IdC users
            }
            return [switchToAmazonQNode()]
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

    public updateShowFreeTierLimitReachedNode(show: boolean) {
        this._showFreeTierLimitReachedNode = show
    }
}

export const amazonQNode = new AmazonQNode()
export const refreshCodeWhisperer = Commands.register(
    { id: 'aws.amazonq.refresh', logging: false },
    (showFreeTierLimitNode = false) => {
        amazonQNode.updateShowFreeTierLimitReachedNode(showFreeTierLimitNode)
        amazonQNode.refresh()
    }
)

export const refreshCodeWhispererRootNode = Commands.register(
    { id: 'aws.amazonq.refreshRootNode', logging: false },
    () => {
        amazonQNode.refreshRootNode()
    }
)
