/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { ResourceTreeDataProvider, TreeNode } from '../shared/treeview/resourceTreeDataProvider'
import { Command, Commands } from '../shared/vscode/commands2'
import { Icon, getIcon } from '../shared/icons'
import { contextKey, setContext } from '../shared/vscode/setContext'
import { NotificationType, OnReceiveType, ToolkitNotification, getNotificationTelemetryId } from './types'
import { ToolkitError } from '../shared/errors'
import { isAmazonQ } from '../shared/extensionUtilities'
import { getLogger } from '../shared/logger/logger'
import { registerToolView } from '../awsexplorer/activationShared'
import { readonlyDocument } from '../shared/utilities/textDocumentUtilities'
import { openUrl } from '../shared/utilities/vsCodeUtils'
import { telemetry } from '../shared/telemetry/telemetry'
import globals from '../shared/extensionGlobals'

const localize = nls.loadMessageBundle()
const logger = getLogger('notifications')

/**
 * Controls the "Notifications" side panel/tree in each extension. It takes purely UX actions
 * and does not determine what notifications to dispaly or how to fetch and store them.
 */
export class NotificationsNode implements TreeNode {
    public static readonly title = localize('AWS.notifications.title', 'Notifications')

    public readonly id = 'notifications'
    public readonly resource = this
    public provider?: ResourceTreeDataProvider
    public startUpNotifications: ToolkitNotification[] = []
    public emergencyNotifications: ToolkitNotification[] = []

    /** Command executed when a notification item is clicked on in the panel. */
    private readonly openNotificationCmd: Command
    private readonly focusCmdStr: string
    private readonly showContextStr: contextKey
    private readonly startUpNodeContext: string
    private readonly emergencyNodeContext: string
    private view: vscode.TreeView<TreeNode> | undefined

    static #instance: NotificationsNode

    private constructor() {
        this.openNotificationCmd = Commands.register(
            isAmazonQ() ? '_aws.amazonq.notifications.open' : '_aws.toolkit.notifications.open',
            (n: ToolkitNotification) => {
                return telemetry.ui_click.run((span) => {
                    span.record({ elementId: getNotificationTelemetryId(n) })
                    return this.openNotification(n)
                })
            }
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
        const item = new vscode.TreeItem(NotificationsNode.title)
        item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed
        item.contextValue = 'notifications'

        return item
    }

    public refresh() {
        const totalNotifications = this.notificationCount()
        if (this.view) {
            if (totalNotifications > 0) {
                this.view.badge = {
                    tooltip: `${totalNotifications} notification${totalNotifications > 1 ? 's' : ''}`,
                    value: totalNotifications,
                }
                this.view.title = `${NotificationsNode.title} (${totalNotifications})`
            } else {
                this.view.badge = undefined
                this.view.title = NotificationsNode.title
            }
        } else {
            logger.warn('NotificationsNode was refreshed but the view was not initialized!')
        }

        this.provider?.refresh()
        return setContext(this.showContextStr, totalNotifications > 0)
    }

    public getChildren() {
        const buildNode = (n: ToolkitNotification, type: NotificationType) => {
            const icon: Icon =
                type === 'emergency'
                    ? Object.assign(getIcon('vscode-alert') as Icon, {
                          color: new vscode.ThemeColor('errorForeground'),
                      })
                    : (getIcon('vscode-question') as Icon)

            const title = n.uiRenderInstructions.content['en-US'].title
            return this.openNotificationCmd.build(n).asTreeNode({
                label: title,
                tooltip: title,
                iconPath: icon,
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
    public async setNotifications(startUp: ToolkitNotification[], emergency: ToolkitNotification[]) {
        this.startUpNotifications = startUp
        this.emergencyNotifications = emergency
        await this.refresh()
    }

    /**
     * Deletes a notification node from the panel. This is purely a UX action - nothing happens
     * to the notification on the backend via this function.
     *
     * Only dismisses startup notifications.
     */
    public async dismissStartUpNotification(id: string) {
        this.startUpNotifications = this.startUpNotifications.filter((n) => n.id !== id)
        await this.refresh()
    }

    /**
     * Will uncollapse/unhide the notifications panel from view and focus it.
     */
    public focusPanel() {
        return vscode.commands.executeCommand(this.focusCmdStr)
    }

    private notificationCount() {
        return this.startUpNotifications.length + this.emergencyNotifications.length
    }

    /**
     * Fired when a notification is clicked on in the panel. It will run any rendering
     * instructions included in the notification. See {@link ToolkitNotification.uiRenderInstructions}.
     */
    public async openNotification(notification: ToolkitNotification) {
        const onClickType = notification.uiRenderInstructions.onClick.type
        switch (onClickType) {
            case 'modal':
                // Render blocking modal
                logger.verbose(`rendering modal for notificaiton: ${notification.id} ...`)
                await this.showInformationWindow(notification, 'modal', false)
                break
            case 'openUrl':
                // Show open url option
                if (!notification.uiRenderInstructions.onClick.url) {
                    throw new ToolkitError('No url provided for onclick open url')
                }
                logger.verbose(`opening url for notification: ${notification.id} ...`)
                await openUrl(
                    vscode.Uri.parse(notification.uiRenderInstructions.onClick.url),
                    getNotificationTelemetryId(notification)
                )
                break
            case 'openTextDocument':
                // Display read-only txt document
                logger.verbose(`showing txt document for notification: ${notification.id} ...`)
                await telemetry.toolkit_invokeAction.run(async () => {
                    telemetry.record({
                        id: getNotificationTelemetryId(notification),
                        source: getNotificationTelemetryId(notification),
                        action: onClickType,
                    })
                    await readonlyDocument.show(
                        notification.uiRenderInstructions.content['en-US'].description,
                        `Notification: ${notification.id}`
                    )
                })
                break
        }
    }

    /**
     * Renders information window with the notification's content and buttons.
     * Can be either a blocking modal or a bottom-right corner toast
     * Handles the button click actions based on the button type.
     */
    private showInformationWindow(
        notification: ToolkitNotification,
        type: OnReceiveType = 'toast',
        passive: boolean = false
    ) {
        const isModal = type === 'modal'

        // modal has to have defined actions (buttons)
        const buttons = notification.uiRenderInstructions.actions ?? []
        const buttonLabels = buttons.map((actions) => actions.displayText['en-US'])
        const detail = notification.uiRenderInstructions.content['en-US'].description

        // we use toastPreview to display as title for toast, since detail won't be shown
        const title = isModal
            ? notification.uiRenderInstructions.content['en-US'].title
            : (notification.uiRenderInstructions.content['en-US'].toastPreview ??
              notification.uiRenderInstructions.content['en-US'].title)

        telemetry.toolkit_showNotification.emit({
            id: getNotificationTelemetryId(notification),
            passive,
            component: 'editor',
            result: 'Succeeded',
        })

        return vscode.window
            .showInformationMessage(title, { modal: isModal, detail }, ...buttonLabels)
            .then((response) => {
                return telemetry.toolkit_invokeAction.run(async (span) => {
                    span.record({
                        id: getNotificationTelemetryId(notification),
                        source: getNotificationTelemetryId(notification),
                        action: response ?? 'OK',
                    })
                    if (response) {
                        const selectedButton = buttons.find((actions) => actions.displayText['en-US'] === response)
                        // Different button options
                        if (selectedButton) {
                            span.record({ action: selectedButton.type })
                            switch (selectedButton.type) {
                                case 'openTextDocument':
                                    await readonlyDocument.show(
                                        notification.uiRenderInstructions.content['en-US'].description,
                                        `Notification: ${notification.id}`
                                    )
                                    break
                                case 'updateAndReload':
                                    // Give things time to finish executing.
                                    globals.clock.setTimeout(() => {
                                        return this.updateAndReload(notification.displayIf.extensionId)
                                    }, 1000)
                                    break
                                case 'openUrl':
                                    if (selectedButton.url) {
                                        await openUrl(vscode.Uri.parse(selectedButton.url))
                                    } else {
                                        throw new ToolkitError('url not provided')
                                    }
                                    break
                                default:
                                    throw new ToolkitError('button action not defined')
                            }
                        }
                    }
                })
            })
    }

    public async onReceiveNotifications(notifications: ToolkitNotification[]) {
        for (const notification of notifications) {
            void this.showInformationWindow(notification, notification.uiRenderInstructions.onReceive, true)
        }
    }

    private async updateAndReload(id: string) {
        logger.verbose('Updating and reloading the extension...')

        // Publish pending telemetry before it is lost to the window reload.
        await globals.telemetry.flushRecords()

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
            this.#instance = new NotificationsNode()
        }

        return this.#instance
    }

    registerProvider(provider: ResourceTreeDataProvider) {
        this.provider = provider
    }

    registerView(context: vscode.ExtensionContext) {
        this.view = registerToolView(
            {
                nodes: [this],
                view: isAmazonQ() ? 'aws.amazonq.notifications' : 'aws.toolkit.notifications',
                refreshCommands: [(provider: ResourceTreeDataProvider) => this.registerProvider(provider)],
            },
            context
        )
    }
}
