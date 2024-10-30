/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ToolkitError } from '../shared/errors'
import globals from '../shared/extensionGlobals'
import { globalKey } from '../shared/globalState'
import { NotificationsState, NotificationsStateConstructor, NotificationType, ToolkitNotification } from './types'
import { HttpResourceFetcher } from '../shared/resourcefetcher/httpResourceFetcher'
import { getLogger } from '../shared/logger/logger'
import { NotificationsNode } from './panelNode'
import { Commands } from '../shared/vscode/commands2'
import { RuleEngine } from './rules'
import { TreeNode } from '../shared/treeview/resourceTreeDataProvider'
import { withRetries } from '../shared/utilities/functionUtils'
import { FileResourceFetcher } from '../shared/resourcefetcher/fileResourceFetcher'
import { isAmazonQ } from '../shared/extensionUtilities'

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
    public static readonly suggestedPollIntervalMs = 1000 * 60 * 10 // 10 minutes

    public readonly storageKey: globalKey

    /** Internal memory state that is written to global state upon modification. */
    private readonly state: NotificationsState

    static #instance: NotificationsController | undefined

    constructor(
        private readonly notificationsNode: NotificationsNode,
        private readonly fetcher: NotificationFetcher = new RemoteFetcher()
    ) {
        if (!NotificationsController.#instance) {
            // Register on first creation only.
            registerDismissCommand()
        }
        NotificationsController.#instance = this

        this.storageKey = 'aws.notifications'
        this.state = globals.globalState.tryGet<NotificationsState>(this.storageKey, NotificationsStateConstructor, {
            startUp: {},
            emergency: {},
            dismissed: [],
            newlyReceived: [],
        })
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
            getLogger('notifications').error(`Unable to fetch %s notifications: %s`, category, err)
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

        // Process on-receive behavior for newly received notifications that passes rule engine
        const newlyReceivedToDisplay = [...startUp, ...emergency].filter((n) => this.state.newlyReceived.includes(n.id))
        if (newlyReceivedToDisplay.length > 0) {
            await this.notificationsNode.onReceiveNotifications(newlyReceivedToDisplay)
            // remove displayed notifications from newlyReceived
            this.state.newlyReceived = this.state.newlyReceived.filter(
                (id) => !newlyReceivedToDisplay.some((n) => n.id === id)
            )
        }
    }

    /**
     * Permanently hides a notification from view. Only 'startUp' notifications can be dismissed.
     * Users are able to collapse or hide the notifications panel in native VSC if they want to
     * hide all notifications.
     */
    public async dismissNotification(notificationId: string) {
        getLogger('notifications').debug('Dismissing notification: %s', notificationId)
        this.state.dismissed.push(notificationId)
        await this.writeState()

        NotificationsNode.instance.dismissStartUpNotification(notificationId)
    }

    /**
     * Fetch notifications from the endpoint and store them in the global state.
     */
    private async fetchNotifications(category: NotificationType) {
        const response = await this.fetcher.fetch(category, this.state[category].eTag)
        if (!response.content) {
            getLogger('notifications').verbose('No new notifications for category: %s', category)
            return
        }
        // Parse the notifications
        const newPayload = JSON.parse(response.content)
        const newNotifications = newPayload.notifications ?? []

        // Get the current notifications
        const currentNotifications = this.state[category].payload?.notifications ?? []
        const currentNotificationIds = new Set(currentNotifications.map((n: any) => n.id))

        // Compare and find if there's any notifications newly added
        const addedNotifications = newNotifications.filter((n: any) => !currentNotificationIds.has(n.id))

        if (addedNotifications.length > 0) {
            getLogger('notifications').verbose(
                'New notifications received for category %s, ids: %s',
                category,
                addedNotifications.map((n: any) => n.id).join(', ')
            )
            this.state.newlyReceived.push(...addedNotifications.map((n: any) => n.id))
        }

        this.state[category].payload = newPayload
        this.state[category].eTag = response.eTag
        await this.writeState()

        getLogger('notifications').verbose(
            "Fetched notifications JSON for category '%s' with schema version: %s. There were %d notifications.",
            category,
            this.state[category].payload?.schemaVersion,
            this.state[category].payload?.notifications?.length
        )
    }

    /**
     * Write the latest memory state to global state.
     */
    private async writeState() {
        getLogger('notifications').debug('NotificationsController: Updating notifications state at %s', this.storageKey)

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

function registerDismissCommand() {
    const name = isAmazonQ() ? '_aws.amazonq.notifications.dismiss' : '_aws.toolkit.notifications.dismiss'

    globals.context.subscriptions.push(
        Commands.register(name, async (node: TreeNode) => {
            const item = node?.getTreeItem()
            if (item instanceof vscode.TreeItem && item.command?.arguments) {
                // The command used to build the TreeNode contains the notification as an argument.
                /** See {@link NotificationsNode} for more info. */
                const notification = item.command?.arguments[0] as ToolkitNotification

                await NotificationsController.instance.dismissNotification(notification.id)
            } else {
                getLogger('notifications').error(`${name}: Cannot dismiss notification: item is not a vscode.TreeItem`)
            }
        })
    )
}

export type ResourceResponse = Awaited<ReturnType<HttpResourceFetcher['getNewETagContent']>>

export interface NotificationFetcher {
    /**
     * Fetch notifications from some source. If there is no (new) data to fetch, then the response's
     * content value will be undefined.
     *
     * @param type typeof NotificationType
     * @param versionTag last known version of the data aka ETAG. Can be used to determine if the data changed.
     */
    fetch(type: NotificationType, versionTag?: string): Promise<ResourceResponse>
}

export class RemoteFetcher implements NotificationFetcher {
    public static readonly retryNumber = 5
    public static readonly retryIntervalMs = 30000

    private readonly startUpEndpoint: string =
        'https://idetoolkits-hostedfiles.amazonaws.com/Notifications/VSCode/startup/1.x.json'
    private readonly emergencyEndpoint: string =
        'https://idetoolkits-hostedfiles.amazonaws.com/Notifications/VSCode/emergency/1.x.json'

    constructor(startUpPath?: string, emergencyPath?: string) {
        this.startUpEndpoint = startUpPath ?? this.startUpEndpoint
        this.emergencyEndpoint = emergencyPath ?? this.emergencyEndpoint
    }

    fetch(category: NotificationType, versionTag?: string): Promise<ResourceResponse> {
        const endpoint = category === 'startUp' ? this.startUpEndpoint : this.emergencyEndpoint
        const fetcher = new HttpResourceFetcher(endpoint, {
            showUrl: true,
        })
        getLogger('notifications').verbose(
            'Attempting to fetch notifications for category: %s at endpoint: %s',
            category,
            endpoint
        )

        return withRetries(async () => await fetcher.getNewETagContent(versionTag), {
            maxRetries: RemoteFetcher.retryNumber,
            delay: RemoteFetcher.retryIntervalMs,
            // No exponential backoff - necessary?
        })
    }
}

/**
 * Can be used when developing locally. This may be expanded at some point to allow notifications
 * to be published via github rather than internally.
 *
 * versionTag (ETAG) is ignored.
 */
export class LocalFetcher implements NotificationFetcher {
    // Paths relative to running extension root folder (e.g. packages/amazonq/).
    private readonly startUpLocalPath: string = '../core/src/test/notifications/resources/startup/1.x.json'
    private readonly emergencyLocalPath: string = '../core/src/test/notifications/resources/emergency/1.x.json'

    constructor(startUpPath?: string, emergencyPath?: string) {
        this.startUpLocalPath = startUpPath ?? this.startUpLocalPath
        this.emergencyLocalPath = emergencyPath ?? this.emergencyLocalPath
    }

    async fetch(category: NotificationType, versionTag?: string): Promise<ResourceResponse> {
        const uri = category === 'startUp' ? this.startUpLocalPath : this.emergencyLocalPath
        getLogger('notifications').verbose(
            'Attempting to fetch notifications locally for category: %s at path: %s',
            category,
            uri
        )

        return {
            content: await new FileResourceFetcher(globals.context.asAbsolutePath(uri)).get(),
            eTag: 'LOCAL_PATH',
        }
    }
}
