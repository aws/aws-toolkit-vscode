/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ResourceTreeDataProvider, TreeNode } from '../../shared/treeview/resourceTreeDataProvider'
import { AuthState, isPreviousQUser } from '../../codewhisperer/util/authUtil'
import { createLearnMoreNode, createInstallQNode, createDismissNode } from './amazonQChildrenNodes'
import { Commands } from '../../shared/vscode/commands2'
import { isExtensionInstalled } from '../../shared/utilities/vsCodeUtils'
import { amazonQDismissedKey } from '../../codewhisperer/models/constants'
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

    public static amazonQState: AuthState

    private constructor() {}

    public getTreeItem() {
        const item = new vscode.TreeItem('Amazon Q')
        item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed
        item.contextValue = 'awsAmazonQNode'

        return item
    }

    public refresh(): void {
        this.onDidChangeChildrenEmitter.fire()
    }

    public refreshRootNode() {
        this.onDidChangeTreeItemEmitter.fire()
    }

    public getChildren() {
        const children = [createInstallQNode(), createLearnMoreNode()]
        if (!isPreviousQUser()) {
            children.push(createDismissNode())
        }
        return children
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

    static #instance: AmazonQNode

    static get instance(): AmazonQNode {
        return (this.#instance ??= new AmazonQNode())
    }
}

/**
 * Refreshes the Amazon Q Tree node. If Amazon Q's connection state is provided, it will also internally
 * update the connection state.
 *
 * This command is meant to be called by Amazon Q. It doesn't serve much purpose being called otherwise.
 */
export const refreshAmazonQ = (provider?: ResourceTreeDataProvider) =>
    Commands.register({ id: '_aws.toolkit.amazonq.refreshTreeNode', logging: false }, () => {
        AmazonQNode.instance.refresh()
        if (provider) {
            provider.refresh()
        }
    })

export const refreshAmazonQRootNode = (provider?: ResourceTreeDataProvider) =>
    Commands.register({ id: '_aws.amazonq.refreshRootNode', logging: false }, async () => {
        if (isExtensionInstalled(VSCODE_EXTENSION_ID.amazonq)) {
            await vscode.commands.executeCommand('setContext', amazonQDismissedKey, true)
        }
        AmazonQNode.instance.refreshRootNode()
        if (provider) {
            provider.refresh()
        }
    })
