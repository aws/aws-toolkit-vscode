/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ToolkitError } from '../shared/errors'
import globals from '../shared/extensionGlobals'
import { globalKey } from '../shared/globalState'
import {
    getNotificationTelemetryId,
    Notifications,
    NotificationsState,
    NotificationsStateConstructor,
    NotificationType,
    ToolkitNotification,
} from './types'
import { HttpResourceFetcher } from '../shared/resourcefetcher/httpResourceFetcher'
import { getLogger } from '../shared/logger/logger'
import { NotificationsNode } from './panelNode'
import { Commands } from '../shared/vscode/commands2'
import { RuleEngine } from './rules'
import { TreeNode } from '../shared/treeview/resourceTreeDataProvider'
import { withRetries } from '../shared/utilities/functionUtils'
import { FileResourceFetcher } from '../shared/resourcefetcher/fileResourceFetcher'
import { isAmazonQ } from '../shared/extensionUtilities'
import { telemetry } from '../shared/telemetry/telemetry'

const logger = getLogger('notifications')

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
    /** Internal memory state that is written to global state upon modification. */
    private readonly state: NotificationsState

    static #instance: NotificationsController | undefined

    constructor(
        private readonly notificationsNode: NotificationsNode,
        private readonly fetcher: NotificationFetcher = new RemoteFetcher(),
        public readonly storageKey: globalKey = 'aws.notifications'
    ) {
        if (!NotificationsController.#instance) {
            // Register on first creation only.
            registerDismissCommand()
        }
        NotificationsController.#instance = this

        this.state = this.getDefaultState()
    }

    public pollForStartUp(ruleEngine: RuleEngine) {
        return this.poll(ruleEngine, 'startUp')
    }

    public pollForEmergencies(ruleEngine: RuleEngine) {
        return this.poll(ruleEngine, 'emergency')
    }

    private async poll(ruleEngine: RuleEngine, category: NotificationType) {
        try {
            // Get latest state in case it was modified by other windows.
            // It is a minimal read to avoid race conditions.
            this.readState()
            await this.fetchNotifications(category)
        } catch (err: any) {
            logger.error(`Unable to fetch %s notifications: %s`, category, err)
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

        await NotificationsNode.instance.setNotifications(startUp, emergency)

        // Process on-receive behavior for newly received notifications that passes rule engine
        const wasNewlyReceived = (n: ToolkitNotification) => this.state.newlyReceived.includes(n.id)
        const newStartUp = startUp.filter(wasNewlyReceived)
        const newEmergency = emergency.filter(wasNewlyReceived)
        const newlyReceived = [...newStartUp, ...newEmergency]

        if (newlyReceived.length > 0) {
            await this.notificationsNode.onReceiveNotifications(newlyReceived)
            // remove displayed notifications from newlyReceived
            this.state.newlyReceived = this.state.newlyReceived.filter((id) => !newlyReceived.some((n) => n.id === id))
            await this.writeState()
            if (newEmergency.length > 0) {
                void this.notificationsNode.focusPanel()
            }
        }
    }

    /**
     * Permanently hides a notification from view. Only 'startUp' notifications can be dismissed.
     * Users are able to collapse or hide the notifications panel in native VSC if they want to
     * hide all notifications.
     */
    public async dismissNotification(notificationId: string) {
        logger.debug('Dismissing notification: %s', notificationId)

        this.readState() // Don't overwrite dismissals from other windows
        this.state.dismissed.push(notificationId)
        await this.writeState()

        await NotificationsNode.instance.dismissStartUpNotification(notificationId)
    }

    /**
     * Fetch notifications from the endpoint and store them in the global state.
     */
    private async fetchNotifications(category: NotificationType) {
        const response = await this.fetcher.fetch(category, this.state[category].eTag)
        if (!response.content) {
            logger.verbose('No new notifications for category: %s', category)
            return
        }
        // Parse the notifications
        const newPayload: Notifications = JSON.parse(response.content)
        const newNotifications = newPayload.notifications ?? []

        // Get the current notifications
        const currentNotifications = this.state[category].payload?.notifications ?? []
        const currentNotificationIds = new Set(currentNotifications.map((n: any) => n.id))

        // Compare and find if there's any notifications newly added
        const addedNotifications = newNotifications.filter((n: any) => !currentNotificationIds.has(n.id))

        if (addedNotifications.length > 0) {
            logger.verbose(
                'New notifications received for category %s, ids: %s',
                category,
                addedNotifications.map((n: any) => n.id).join(', ')
            )
            this.state.newlyReceived.push(...addedNotifications.map((n: any) => n.id))
        }

        this.state[category].payload = newPayload
        this.state[category].eTag = response.eTag
        await this.writeState()

        logger.verbose(
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
        logger.debug('NotificationsController: Updating notifications state at %s', this.storageKey)

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

    /**
     * Read relevant values from the latest global state to memory. Useful to bring changes from other windows.
     *
     * Currently only brings dismissed, so users with multiple vscode instances open do not have issues with
     * dismissing notifications multiple times. Otherwise, each instance has an independent session for
     * displaying the notifications (e.g. multiple windows can be blocked in critical emergencies).
     *
     * Note: This sort of pattern (reading back and forth from global state in async functions) is prone to
     * race conditions, which is why we limit the read to the fairly inconsequential `dismissed` property.
     */
    private readState() {
        const state = this.getDefaultState()
        this.state.dismissed = [...new Set([...this.state.dismissed, ...state.dismissed])]
    }

    /**
     * Returns stored notification state, or a default state object if it is invalid or undefined.
     */
    private getDefaultState() {
        return globals.globalState.tryGet<NotificationsState>(this.storageKey, NotificationsStateConstructor, {
            startUp: {},
            emergency: {},
            dismissed: [],
            newlyReceived: [],
        })
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

                await telemetry.ui_click.run(async (span) => {
                    span.record({ elementId: `${getNotificationTelemetryId(notification)}:DISMISS` })
                    await NotificationsController.instance.dismissNotification(notification.id)
                })
            } else {
                logger.error(`${name}: Cannot dismiss notification: item is not a vscode.TreeItem`)
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
        logger.verbose('Attempting to fetch notifications for category: %s at endpoint: %s', category, endpoint)

        return withRetries(
            async () => {
                try {
                    return await fetcher.getNewETagContent(versionTag)
                } catch (err) {
                    logger.error('Failed to fetch at endpoint: %s, err: %s', endpoint, err)
                    throw err
                }
            },
            {
                maxRetries: RemoteFetcher.retryNumber,
                delay: RemoteFetcher.retryIntervalMs,
                // No exponential backoff - necessary?
            }
        )
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
        logger.verbose('Attempting to fetch notifications locally for category: %s at path: %s', category, uri)

        return {
            content: await new FileResourceFetcher(globals.context.asAbsolutePath(uri)).get(),
            eTag: 'LOCAL_PATH',
        }
    }
}
