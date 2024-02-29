/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { TreeNode } from '../shared/treeview/resourceTreeDataProvider'
import { createLearnMoreNode } from '../amazonq/explorer/amazonQChildrenNodes'
import { Commands } from '../shared/vscode/commands2'
import { getIcon } from '../shared/icons'

const localize = nls.loadMessageBundle()
// TODO: Implement the commands

const dismissCommand = Commands.declare('aws.amazonq.dismiss', () => () => {})

const openChatPanel = Commands.declare('aws.amazonq.openChatPanel', () => () => {})

const menuMoved = Commands.declare('aws.amazonq.menuMoved', () => () => {})

const installQCommand = Commands.declare('aws.amazonq.install', () => () => {})

const createDismissNode = () =>
    dismissCommand.build().asTreeNode({
        label: localize('AWS.amazonq.dismiss', 'Dismiss'),
        iconPath: getIcon('vscode-error'),
        contextValue: '',
    })

const createInstallQNode = () =>
    installQCommand.build().asTreeNode({
        label: localize('AWS.amazonq.install', 'Install the Amazon Q Extension'),
        iconPath: getIcon('vscode-add'),
        contextValue: '',
    })

const createOpenChatPanelNode = () =>
    openChatPanel.build().asTreeNode({
        label: localize('AWS.amazonq.openChatPanel', 'Open Q Chat Panel'),
        iconPath: getIcon('vscode-add'),
        contextValue: '',
    })

const createMenuMovedNode = () =>
    menuMoved.build().asTreeNode({
        label: localize('AWS.amazonq.menuMoved', 'Menu MOved'),
        iconPath: getIcon('vscode-add'),
        contextValue: '',
    })

export class AmazonQMigrationNode implements TreeNode {
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
        const item = new vscode.TreeItem('Amazon Q + CodeWhisperer')
        item.description = this.getDescription()
        item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed
        return item
    }

    public refresh(): void {
        this.onDidChangeChildrenEmitter.fire()
    }

    public refreshRootNode() {
        this.onDidChangeTreeItemEmitter.fire()
    }

    private getDescription(): string {
        return ''
    }

    public isAmazonQInstalled(): boolean {
        const extensions = vscode.extensions.all
        const q = extensions.find(x => x.id === 'amazonwebservices.amazonq')
        return q !== undefined
    }

    public getChildren() {
        if (!this.isAmazonQInstalled()) {
            return [createInstallQNode(), createLearnMoreNode(), createDismissNode()]
        }
        return [createOpenChatPanelNode(), createMenuMovedNode()]
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

export const amazonQMigrationNode = new AmazonQMigrationNode()
