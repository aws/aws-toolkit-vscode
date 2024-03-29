/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { createFreeTierLimitMet, createReconnect } from '../../codewhisperer/ui/codeWhispererNodes'
import { ResourceTreeDataProvider, TreeNode } from '../../shared/treeview/resourceTreeDataProvider'
import { AuthState, AuthUtil, isPreviousQUser } from '../../codewhisperer/util/authUtil'
import {
    createLearnMoreNode,
    switchToAmazonQNode,
    createInstallQNode,
    createDismissNode,
    createSignIn,
} from './amazonQChildrenNodes'
import { Command, Commands } from '../../shared/vscode/commands2'
import { listCodeWhispererCommands } from '../../codewhisperer/ui/statusBarMenu'
import { getIcon } from '../../shared/icons'
import { vsCodeState } from '../../codewhisperer/models/model'
import { isExtensionActive, isExtensionInstalled } from '../../shared/utilities/vsCodeUtils'
import { VSCODE_EXTENSION_ID } from '../../shared/extensions'
import { getLogger } from '../../shared/logger'

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

    private constructor() {
        // This case handles if the Toolkit extension is installed or activated after the Amazon Q extension.
        // This command is registered in Amazon Q.
        if (isExtensionActive(VSCODE_EXTENSION_ID.amazonq)) {
            // 'void' instead of await, so that the command call doesn't trigger an infinite loop
            // on constructing these instances.
            void vscode.commands.executeCommand('_aws.amazonq.refreshToolkitQTreeState')
        }
    }

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
        if (AuthUtil.instance.isConnectionValid()) {
            if (AuthUtil.instance.isEnterpriseSsoInUse()) {
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
        if (!isExtensionInstalled(VSCODE_EXTENSION_ID.amazonq)) {
            const children = [createInstallQNode(), createLearnMoreNode()]
            if (!isPreviousQUser()) {
                children.push(createDismissNode())
            }
            return children
        } else {
            if (AmazonQNode.amazonQState === 'expired') {
                return [createReconnect('tree'), createLearnMoreNode()]
            }

            if (AmazonQNode.amazonQState !== 'connected') {
                return [createSignIn('tree'), createLearnMoreNode()]
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

    static #instance: AmazonQNode

    static get instance(): AmazonQNode {
        return (this.#instance ??= new AmazonQNode())
    }
}

function createNewMenuButton(): TreeNode<Command> {
    return listCodeWhispererCommands.build().asTreeNode({
        label: 'New: Menu moved to status bar',
        iconPath: getIcon('vscode-megaphone'),
        description: 'Learn more',
    })
}
/**
 * Refreshes the Amazon Q Tree node. If Amazon Q's connection state is provided, it will also internally
 * update the connection state.
 *
 * This command is meant to be called by Amazon Q. It doesn't serve much purpose being called otherwise.
 */
export const refreshAmazonQ = (provider?: ResourceTreeDataProvider) =>
    Commands.register({ id: '_aws.toolkit.amazonq.refreshTreeNode', logging: false }, (state?: AuthState) => {
        if (state) {
            AmazonQNode.amazonQState = state
            getLogger().debug(`_aws.toolkit.amazonq.refreshTreeNode called, updating state to ${state}.`)
        } else {
            getLogger().debug(`_aws.toolkit.amazonq.refreshTreeNode was called, but state wasn't specified.`)
        }

        AmazonQNode.instance.refresh()
        if (provider) {
            provider.refresh()
        }
    })

export const refreshAmazonQRootNode = (provider?: ResourceTreeDataProvider) =>
    Commands.register({ id: '_aws.amazonq.refreshRootNode', logging: false }, () => {
        AmazonQNode.instance.refreshRootNode()
        if (provider) {
            provider.refresh()
        }
    })
