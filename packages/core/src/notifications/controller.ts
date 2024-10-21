/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ToolkitError } from '../shared/errors'
import globals from '../shared/extensionGlobals'
import { globalKey } from '../shared/globalState'
import { NotificationsState, NotificationType, NotificationData, ToolkitNotification } from './types'
import { HttpResourceFetcher } from '../shared/resourcefetcher/httpResourceFetcher'
import { getLogger } from '../shared/logger/logger'
import { NotificationsNode } from './panelNode'
import { Commands } from '../shared/vscode/commands2'
import { RuleEngine } from './rules'
import { TreeNode } from '../shared/treeview/resourceTreeDataProvider'
import { withRetries } from '../shared/utilities/functionUtils'
import { FileResourceFetcher } from '../shared/resourcefetcher/fileResourceFetcher'

const startUpEndpoint = 'https://idetoolkits-hostedfiles.amazonaws.com/Notifications/VSCode/startup/1.x.json'
const emergencyEndpoint = 'https://idetoolkits-hostedfiles.amazonaws.com/Notifications/VSCode/emergency/1.x.json'

type ResourceResponse = Awaited<ReturnType<HttpResourceFetcher['getNewETagContent']>>

/**
 * Handles fetching and maintaining the state of in-IDE notifications.
 * Notifications are constantly polled from a known endpoint and then stored in global state.
 * The global state is used to compare if there are a change in notifications on the endpoint
 * or if the endpoint is not reachable.
 *
 * This class will send any notifications to {@link NotificationsNode} for display.
 * Notifications can be dismissed.
 *
 * Startup notifications - fetched each start up.
 * Emergency notifications - fetched at a regular interval.
 */
export class NotificationsController {
    public static readonly retryNumber = 5
    public static readonly retryIntervalMs = 30000
    public static readonly suggestedPollIntervalMs = 1000 * 60 * 10 // 10 minutes

    public readonly storageKey: globalKey

    /** Internal memory state that is written to global state upon modification. */
    private readonly state: NotificationsState
    private readonly notificationsNode: NotificationsNode

    static #instance: NotificationsController | undefined

    constructor(extPrefix: 'amazonq' | 'toolkit', node: NotificationsNode) {
        if (!NotificationsController.#instance) {
            registerDismissCommand(extPrefix)
        }
        NotificationsController.#instance = this

        this.storageKey = `aws.${extPrefix}.notifications`
        this.notificationsNode = node

        this.state = globals.globalState.get(this.storageKey) ?? {
            startUp: {} as NotificationData,
            emergency: {} as NotificationData,
            dismissed: [],
        }
        this.state.startUp = this.state.startUp ?? {}
        this.state.emergency = this.state.emergency ?? {}
        this.state.dismissed = this.state.dismissed ?? []
    }

    public pollForStartUp(ruleEngine: RuleEngine) {
        return this.poll(ruleEngine, 'startUp')
    }

    public pollForEmergencies(ruleEngine: RuleEngine) {
        return this.poll(ruleEngine, 'emergency')
    }

    private async poll(ruleEngine: RuleEngine, category: NotificationType) {
        try {
            await this.fetchNotifications(category)
        } catch (err: any) {
            getLogger().error(`Unable to fetch %s notifications: %s`, category, err)
        }

        await this.displayNotifications(ruleEngine)
    }

    private async displayNotifications(ruleEngine: RuleEngine) {
        const dismissed = new Set(this.state.dismissed)
        const startUp =
            this.state.startUp.payload?.notifications.filter(
                (n) => !dismissed.has(n.id) && ruleEngine.shouldDisplayNotification(n)
            ) ?? []
        const emergency = (this.state.emergency.payload?.notifications ?? []).filter((n) =>
            ruleEngine.shouldDisplayNotification(n)
        )

        NotificationsNode.instance.setNotifications(startUp, emergency)

        // Emergency notifications can't be dismissed, but if the user minimizes the panel then
        // we don't want to focus it each time we set the notification nodes.
        // So we store it in dismissed once a focus has been fired for it.
        const newEmergencies = emergency.map((n) => n.id).filter((id) => !dismissed.has(id))
        if (newEmergencies.length > 0) {
            this.state.dismissed = [...this.state.dismissed, ...newEmergencies]
            await this.writeState()
            void this.notificationsNode.focusPanel()
        }
    }

    /**
     * Permanently hides a notification from view. Only 'startUp' notifications can be dismissed.
     * Users are able to collapse or hide the notifications panel in native VSC if they want to
     * hide all notifications.
     */
    public async dismissNotification(notificationId: string) {
        getLogger().debug('Dismissing notification: %s', notificationId)
        this.state.dismissed.push(notificationId)
        await this.writeState()

        NotificationsNode.instance.dismissStartUpNotification(notificationId)
    }

    /**
     * Fetch notifications from the endpoint and store them in the global state.
     */
    private async fetchNotifications(category: NotificationType) {
        const response = _useLocalFiles ? await this.fetchLocally(category) : await this.fetchRemotely(category)
        if (!response.content) {
            getLogger().verbose('No new notifications for category: %s', category)
            return
        }

        getLogger().verbose('ETAG has changed for notifications category: %s', category)

        this.state[category].payload = JSON.parse(response.content)
        this.state[category].eTag = response.eTag
        await this.writeState()

        getLogger().verbose(
            "Fetched notifications JSON for category '%s' with schema version: %s. There were %d notifications.",
            category,
            this.state[category].payload?.schemaVersion,
            this.state[category].payload?.notifications?.length
        )
    }

    private fetchRemotely(category: NotificationType): Promise<ResourceResponse> {
        const fetcher = new HttpResourceFetcher(category === 'startUp' ? startUpEndpoint : emergencyEndpoint, {
            showUrl: true,
        })

        return withRetries(async () => await fetcher.getNewETagContent(this.state[category].eTag), {
            maxRetries: NotificationsController.retryNumber,
            delay: NotificationsController.retryIntervalMs,
            // No exponential backoff - necessary?
        })
    }

    /**
     * Fetch notifications from local files.
     * Intended development purposes only. In the future, we may support adding notifications
     * directly to the codebase.
     */
    private async fetchLocally(category: NotificationType): Promise<ResourceResponse> {
        if (!_useLocalFiles) {
            throw new ToolkitError('fetchLocally: Local file fetching is not enabled.')
        }

        const uri = category === 'startUp' ? startUpLocalPath : emergencyLocalPath
        const content = await new FileResourceFetcher(globals.context.asAbsolutePath(uri)).get()

        getLogger().verbose('Fetched notifications locally for category: %s at path: %s', category, uri)
        return {
            content,
            eTag: 'LOCAL_PATH',
        }
    }

    /**
     * Write the latest memory state to global state.
     */
    private async writeState() {
        getLogger().debug('NotificationsController: Updating notifications state at %s', this.storageKey)

        // Clean out anything in 'dismissed' that doesn't exist anymore.
        const notifications = new Set(
            [
                ...(this.state.startUp.payload?.notifications ?? []),
                ...(this.state.emergency.payload?.notifications ?? []),
            ].map((n) => n.id)
        )
        this.state.dismissed = this.state.dismissed.filter((id) => notifications.has(id))

        await globals.globalState.update(this.storageKey, this.state)
    }

    static get instance() {
        if (this.#instance === undefined) {
            throw new ToolkitError('NotificationsController was accessed before it has been initialized.')
        }

        return this.#instance
    }
}

function registerDismissCommand(extPrefix: string) {
    const name = `_aws.${extPrefix}.notifications.dismiss`

    globals.context.subscriptions.push(
        Commands.register(name, async (node: TreeNode) => {
            const item = node?.getTreeItem()
            if (item instanceof vscode.TreeItem && item.command?.arguments) {
                // The command used to build the TreeNode contains the notification as an argument.
                /** See {@link NotificationsNode} for more info. */
                const notification = item.command?.arguments[0] as ToolkitNotification

                await NotificationsController.instance.dismissNotification(notification.id)
            } else {
                getLogger().error(`${name}: Cannot dismiss notification: item is not a vscode.TreeItem`)
            }
        })
    )
}

/**
 * For development purposes only.
 * Enable this option to test the notifications system locally.
 */
const _useLocalFiles = false
export const _useLocalFilesCheck = _useLocalFiles // export for testing

const startUpLocalPath = '../core/src/test/notifications/resources/startup/1.x.json'
const emergencyLocalPath = '../core/src/test/notifications/resources/emergency/1.x.json'
