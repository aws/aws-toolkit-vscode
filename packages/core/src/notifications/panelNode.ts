/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ResourceTreeDataProvider, TreeNode } from '../shared/treeview/resourceTreeDataProvider'
import { Command, Commands } from '../shared/vscode/commands2'
import { getIcon } from '../shared/icons'
import { contextKey, setContext } from '../shared/vscode/setContext'
import { NotificationType, ToolkitNotification } from './types'
import { ToolkitError } from '../shared/errors'
import { isAmazonQ } from '../shared/extensionUtilities'

/**
 * Controls the "Notifications" side panel/tree in each extension. It takes purely UX actions
 * and does not determine what notifications to dispaly or how to fetch and store them.
 */
export class NotificationsNode implements TreeNode {
    public readonly id = 'notifications'
    public readonly resource = this
    public provider?: ResourceTreeDataProvider
    public startUpNotifications: ToolkitNotification[] = []
    public emergencyNotifications: ToolkitNotification[] = []

    private readonly openNotificationCmd: Command
    private readonly focusCmdStr: string
    private readonly showContextStr: contextKey
    private readonly startUpNodeContext: string
    private readonly emergencyNodeContext: string

    private readonly onDidChangeTreeItemEmitter = new vscode.EventEmitter<void>()
    private readonly onDidChangeChildrenEmitter = new vscode.EventEmitter<void>()
    private readonly onDidChangeVisibilityEmitter = new vscode.EventEmitter<void>()
    public readonly onDidChangeTreeItem = this.onDidChangeTreeItemEmitter.event
    public readonly onDidChangeChildren = this.onDidChangeChildrenEmitter.event
    public readonly onDidChangeVisibility = this.onDidChangeVisibilityEmitter.event

    static #instance: NotificationsNode

    constructor() {
        NotificationsNode.#instance = this

        this.openNotificationCmd = Commands.register(
            isAmazonQ() ? '_aws.amazonq.notifications.open' : '_aws.toolkit.notifications.open',
            async (n: ToolkitNotification) => this.openNotification(n)
        )

        if (isAmazonQ()) {
            this.focusCmdStr = 'aws.amazonq.notifications.focus'
            this.showContextStr = 'aws.amazonq.notifications.show'
            this.startUpNodeContext = 'amazonqNotificationStartUp'
            this.emergencyNodeContext = 'amazonqNotificationEmergency'
        } else {
            this.focusCmdStr = 'aws.toolkit.notifications.focus'
            this.showContextStr = 'aws.toolkit.notifications.show'
            this.startUpNodeContext = 'toolkitNotificationStartUp'
            this.emergencyNodeContext = 'toolkitNotificationEmergency'
        }
    }

    public getTreeItem() {
        const item = new vscode.TreeItem('Notifications')
        item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed
        item.contextValue = 'notifications'

        return item
    }

    public refresh(): void {
        const hasNotifications = this.startUpNotifications.length > 0 || this.emergencyNotifications.length > 0
        void setContext(this.showContextStr, hasNotifications)

        this.onDidChangeChildrenEmitter.fire()
        this.provider?.refresh()
    }

    public refreshRootNode() {
        this.onDidChangeTreeItemEmitter.fire()
        this.provider?.refresh()
    }

    public getChildren() {
        const buildNode = (n: ToolkitNotification, type: NotificationType) => {
            return this.openNotificationCmd.build(n).asTreeNode({
                label: n.uiRenderInstructions.content['en-US'].title,
                iconPath: type === 'startUp' ? getIcon('vscode-question') : getIcon('vscode-alert'),
                contextValue: type === 'startUp' ? this.startUpNodeContext : this.emergencyNodeContext,
            })
        }

        return [
            ...this.emergencyNotifications.map((n) => buildNode(n, 'emergency')),
            ...this.startUpNotifications.map((n) => buildNode(n, 'startUp')),
        ]
    }

    /**
     * Sets the current list of notifications. Nodes are generated for each notification.
     * No other processing is done, see NotificationController.
     */
    public setNotifications(startUp: ToolkitNotification[], emergency: ToolkitNotification[]) {
        this.startUpNotifications = startUp
        this.emergencyNotifications = emergency
        this.refresh()
    }

    /**
     * Deletes a notification node from the panel. This is purely a UX action - nothing happens
     * to the notification on the backend via this function.
     *
     * Only dismisses startup notifications.
     */
    public dismissStartUpNotification(id: string) {
        this.startUpNotifications = this.startUpNotifications.filter((n) => n.id !== id)
        this.refresh()
    }

    /**
     * Will uncollapse/unhide the notifications panel from view and focus it.
     */
    public focusPanel() {
        return vscode.commands.executeCommand(this.focusCmdStr)
    }

    /**
     * Fired when a notification is clicked on in the panel. It will run any rendering
     * instructions included in the notification. See {@link ToolkitNotification.uiRenderInstructions}.
     *
     * TODO: implement more rendering possibilites.
     */
    private async openNotification(notification: ToolkitNotification) {
        await vscode.window.showTextDocument(
            await vscode.workspace.openTextDocument({
                content: notification.uiRenderInstructions.content['en-US'].description,
            })
        )
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

    static get instance() {
        if (this.#instance === undefined) {
            throw new ToolkitError('NotificationsNode was accessed before it has been initialized.')
        }

        return this.#instance
    }
}

export function registerProvider(provider: ResourceTreeDataProvider) {
    NotificationsNode.instance.provider = provider
}
