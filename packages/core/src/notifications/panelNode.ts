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
import { getLogger } from '../shared/logger/logger'
import { tempDirPath } from '../shared/filesystemUtilities'
import path from 'path'
import fs from '../shared/fs/fs'

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
     */
    public async openNotification(notification: ToolkitNotification) {
        switch (notification.uiRenderInstructions.onClick.type) {
            case 'modal':
                // Render blocking modal
                getLogger('notifications').verbose(`rendering modal for notificaiton: ${notification.id} ...`)
                await this.renderModal(notification)
                break
            case 'openUrl':
                if (!notification.uiRenderInstructions.onClick.url) {
                    throw new ToolkitError('No url provided for onclick open url')
                }
                // Show open url option
                getLogger('notifications').verbose(`opening url for notification: ${notification.id} ...`)
                await vscode.env.openExternal(vscode.Uri.parse(notification.uiRenderInstructions.onClick.url))
                break
            case 'openTextDocument':
                // Display read-only txt document
                getLogger('notifications').verbose(`showing txt document for notification: ${notification.id} ...`)
                await this.showReadonlyTextDocument(notification.uiRenderInstructions.content['en-US'].description)
                break
        }
    }

    /**
     * Shows a read only txt file for the contect of notification on a side column
     * It's read-only so that the "save" option doesn't appear when user closes the notification
     */
    private async showReadonlyTextDocument(content: string): Promise<void> {
        try {
            const tempFilePath = path.join(tempDirPath, 'AWSToolkitNotifications.txt')

            if (await fs.existsFile(tempFilePath)) {
                // If file exist, make sure it has write permission (0o644)
                await fs.chmod(tempFilePath, 0o644)
            }

            await fs.writeFile(tempFilePath, content)

            // Set the file permissions to read-only (0o444)
            await fs.chmod(tempFilePath, 0o444)

            // Now, open the document
            const document = await vscode.workspace.openTextDocument(tempFilePath)

            const options: vscode.TextDocumentShowOptions = {
                viewColumn: vscode.ViewColumn.Beside,
                preserveFocus: true,
                preview: true,
            }

            await vscode.window.showTextDocument(document, options)
        } catch (error) {
            throw new ToolkitError(`Error showing text document: ${error}`)
        }
    }

    /**
     * Renders a blocking modal with the notification's content and buttons.
     * Handles the button click actions based on the button type.
     */
    public async renderModal(notification: ToolkitNotification) {
        if (!notification.uiRenderInstructions.actions) {
            throw new ToolkitError('no button defined for modal')
            return
        }

        const buttons = notification.uiRenderInstructions.actions

        const buttonLabels = buttons.map((actions) => actions.displayText['en-US'])

        const detail = notification.uiRenderInstructions.content['en-US'].description

        const selectedButton = await vscode.window.showInformationMessage(
            notification.uiRenderInstructions.content['en-US'].title,
            { modal: true, detail },
            ...buttonLabels
        )

        if (selectedButton) {
            const buttons = notification.uiRenderInstructions.actions.find(
                (actions) => actions.displayText['en-US'] === selectedButton
            )
            // Different button options
            if (buttons) {
                switch (buttons.type) {
                    case 'openTxt':
                        await this.showReadonlyTextDocument(
                            notification.uiRenderInstructions.content['en-US'].description
                        )
                        break
                    case 'updateAndReload':
                        await this.updateAndReload(notification.displayIf.extensionId)
                        break
                    case 'openUrl':
                        if (buttons.url) {
                            await vscode.env.openExternal(vscode.Uri.parse(buttons.url))
                        }
                        break
                    default:
                        throw new ToolkitError('button action not defined')
                }
            }
        }
    }

    public async onReceiveNotifications(notifications: ToolkitNotification[]) {
        for (const notification of notifications) {
            switch (notification.uiRenderInstructions.onRecieve) {
                case 'modal':
                    // Handle modal case
                    void this.renderModal(notification)
                    break
                case 'toast':
                    // toast case, no user input needed
                    void vscode.window.showInformationMessage(
                        notification.uiRenderInstructions.content['en-US'].descriptionPreview ??
                            notification.uiRenderInstructions.content['en-US'].title
                    )
                    break
            }
        }
    }

    private async updateAndReload(id: string) {
        getLogger('notifications').verbose('Updating and reloading the extension...')
        await vscode.commands.executeCommand('workbench.extensions.installExtension', id)
        await vscode.commands.executeCommand('workbench.action.reloadWindow')
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

export const testNotificationsNode = new NotificationsNode()
