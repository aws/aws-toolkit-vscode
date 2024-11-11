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
import { randomUUID } from '../shared/crypto'
import { telemetry } from '../shared/telemetry/telemetry'
import { setContext } from '../shared/vscode/setContext'

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

        Commands.register(
            isAmazonQ() ? 'aws.amazonq.notifications.reset' : 'aws.toolkit.notifications.reset',
            async () => await globals.globalState.update(NotificationsController.instance.storageKey, {})
        )
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
            await this.writeState()
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

                await telemetry.ui_click.run(async (span) => {
                    span.record({ elementId: `${getNotificationTelemetryId(notification)}:DISMISS` })
                    await NotificationsController.instance.dismissNotification(notification.id)
                })
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
        'https://idetoolkits-hostedfiles.amazonaws.com/Notifications/integ/VSCode/startup/1.x.json'
    private readonly emergencyEndpoint: string =
        'https://idetoolkits-hostedfiles.amazonaws.com/Notifications/integ/VSCode/emergency/1.x.json'

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

export class DevFetcher implements NotificationFetcher {
    private startupNotifications: Notifications = { schemaVersion: '0', notifications: [] }
    private emergencyNotifications: Notifications = { schemaVersion: '0', notifications: [] }

    constructor() {
        void setContext(isAmazonQ() ? 'aws.amazonq.notifications.debug' : 'aws.toolkit.notifications.debug', true)
        Commands.register(
            isAmazonQ() ? 'aws.amazonq.notifications.clear' : 'aws.toolkit.notifications.clearStartUp',
            async () => {
                this.startupNotifications.notifications = []
                this.emergencyNotifications.notifications = []
                await globals.globalState.update(NotificationsController.instance.storageKey, {})
                await NotificationsController.instance.pollForStartUp(new RuleEngine())
                await NotificationsController.instance.pollForEmergencies(new RuleEngine())
            }
        )
        Commands.register(
            isAmazonQ() ? 'aws.amazonq.notifications.startup1' : 'aws.toolkit.notifications.startup1',
            async () => {
                const id = `startup${randomUUID()}`
                this.startupNotifications.notifications.push({
                    id,
                    displayIf: {
                        extensionId: globals.context.extension.id,
                    },
                    uiRenderInstructions: {
                        content: {
                            'en-US': {
                                title: 'New Amazon Q Chat features',
                                description:
                                    "You can now use Amazon Q inline in your IDE, without ever touching the mouse or using copy and paste. \nPress ⌘+I (Ctrl+I on Windows) to trigger inline chat. \nDescribe a function or feature you'd like to develop and Amazon Q will generate and display a code diff that inserts new code at the cursor position. \nPress Enter to accept and apply the diff, or Escape to reject it. \nAlternatively you select a block of code (maybe even the entire file) then press ⌘+I (Ctrl+I on Windows) to provide instructions on how to refactor the selected code. \nYou will see a diff against the selected code and can press Enter to accept and apply the diff.\n\nLearn more at https://aws.amazon.com/developer/generative-ai/amazon-q/change-log/",
                                toastPreview: 'New Amazon Q features available: inline chat',
                            },
                        },
                        onRecieve: 'toast',
                        onClick: {
                            type: 'openTextDocument',
                        },
                        actions: [
                            {
                                type: 'openTxt',
                                displayText: {
                                    'en-US': 'Learn more',
                                },
                            },
                        ],
                    },
                })
                // eslint-disable-next-line aws-toolkits/no-json-stringify-in-log
                getLogger().info(
                    JSON.stringify(
                        this.startupNotifications.notifications[this.startupNotifications.notifications.length - 1],
                        undefined,
                        4
                    )
                )
                await NotificationsController.instance.pollForStartUp(new RuleEngine())
            }
        )
        Commands.register(
            isAmazonQ() ? 'aws.amazonq.notifications.startup2' : 'aws.toolkit.notifications.startup2',
            async () => {
                const id = `startup${randomUUID()}`
                this.startupNotifications.notifications.push({
                    id,
                    displayIf: {
                        extensionId: globals.context.extension.id,
                    },
                    uiRenderInstructions: {
                        content: {
                            'en-US': {
                                title: "What's New",
                                description: 'New Amazon Q Chat features available!',
                                toastPreview: 'New Amazon Q features are available!',
                            },
                        },
                        onRecieve: 'toast',
                        onClick: {
                            type: 'openUrl',
                            url: 'https://aws.amazon.com/developer/generative-ai/amazon-q/change-log/',
                        },
                        actions: [
                            {
                                type: 'openUrl',
                                url: 'https://aws.amazon.com/developer/generative-ai/amazon-q/change-log/',
                                displayText: {
                                    'en-US': 'Learn more',
                                },
                            },
                        ],
                    },
                })
                // eslint-disable-next-line aws-toolkits/no-json-stringify-in-log
                getLogger().info(
                    JSON.stringify(
                        this.startupNotifications.notifications[this.startupNotifications.notifications.length - 1],
                        undefined,
                        4
                    )
                )
                await NotificationsController.instance.pollForStartUp(new RuleEngine())
            }
        )
        Commands.register(
            isAmazonQ() ? 'aws.amazonq.notifications.emergency1' : 'aws.toolkit.notifications.emergency1',
            async () => {
                const id = `emergency${randomUUID()}`
                this.emergencyNotifications.notifications.push({
                    id,
                    displayIf: {
                        extensionId: globals.context.extension.id,
                    },
                    uiRenderInstructions: {
                        content: {
                            'en-US': {
                                title: "Can't sign in to Amazon Q",
                                description:
                                    'There is currently a bug that is preventing users from signing into Amazon Q. If this impacts you, please try this workaround:\n\n 1. Reload your IDE\n 2. Run the command in the command palette:: `Amazon Q: Reset State`.\n 3. Set your default region to `us-east-3`.\n 4. Try to sign into Amazon Q with your desired region in the dropdown.\n\nWe are currently working on releasing a fix so that this workaround is not required.\nPlease reach out on our github issues with any questions.',
                                toastPreview:
                                    'Signing into Amazon Q is broken, please try this workaround while we work on releasing a fix.',
                            },
                        },
                        onRecieve: 'toast',
                        onClick: {
                            type: 'openTextDocument',
                        },
                        actions: [
                            {
                                type: 'openTxt',
                                displayText: {
                                    'en-US': 'Learn more',
                                },
                            },
                        ],
                    },
                })
                // eslint-disable-next-line aws-toolkits/no-json-stringify-in-log
                getLogger().info(
                    JSON.stringify(
                        this.emergencyNotifications.notifications[this.emergencyNotifications.notifications.length - 1],
                        undefined,
                        4
                    )
                )
                await NotificationsController.instance.pollForEmergencies(new RuleEngine())
            }
        )
        Commands.register(
            isAmazonQ() ? 'aws.amazonq.notifications.emergency2' : 'aws.toolkit.notifications.emergency2',
            async () => {
                const id = `emergency${randomUUID()}`
                this.emergencyNotifications.notifications.push({
                    id,
                    displayIf: {
                        extensionId: globals.context.extension.id,
                    },
                    uiRenderInstructions: {
                        content: {
                            'en-US': {
                                title: 'Update Amazon Q to avoid breaking bugs',
                                description:
                                    'There is currently a bug that prevents Amazon Q from responding to chat requests. It is fixed in the latest version. Please update your Amazon Q now.',
                                toastPreview:
                                    'This version of Amazon Q is currently broken, please update to avoid issues.',
                            },
                        },
                        onRecieve: 'toast',
                        onClick: {
                            type: 'modal',
                        },
                        actions: [
                            {
                                type: 'updateAndReload',
                                displayText: {
                                    'en-US': 'Update and Reload',
                                },
                            },
                        ],
                    },
                })
                // eslint-disable-next-line aws-toolkits/no-json-stringify-in-log
                getLogger().info(
                    JSON.stringify(
                        this.emergencyNotifications.notifications[this.emergencyNotifications.notifications.length - 1],
                        undefined,
                        4
                    )
                )
                await NotificationsController.instance.pollForEmergencies(new RuleEngine())
            }
        )
        Commands.register(
            isAmazonQ() ? 'aws.amazonq.notifications.emergency3' : 'aws.toolkit.notifications.emergency3',
            async () => {
                const id = `emergency${randomUUID()}`
                this.emergencyNotifications.notifications.push({
                    id,
                    displayIf: {
                        extensionId: 'amazonwebservices.amazon-q-vscode',
                        additionalCriteria: [{ type: 'AuthState', values: ['connected'] }],
                    },
                    uiRenderInstructions: {
                        content: {
                            'en-US': {
                                title: 'Amazon Q may delete user data',
                                description:
                                    'Amazon Q is erroneously deleting user data! Please sign out and sign back into Amazon Q immediately to avoid data loss, or update Amazon Q now.',
                            },
                        },
                        onRecieve: 'modal',
                        onClick: {
                            type: 'modal',
                        },
                        actions: [
                            {
                                type: 'updateAndReload',
                                displayText: {
                                    'en-US': 'Update and Reload',
                                },
                            },
                        ],
                    },
                })
                // eslint-disable-next-line aws-toolkits/no-json-stringify-in-log
                getLogger().info(
                    JSON.stringify(
                        this.emergencyNotifications.notifications[this.emergencyNotifications.notifications.length - 1],
                        undefined,
                        4
                    )
                )
                await NotificationsController.instance.pollForEmergencies(new RuleEngine())
            }
        )
    }

    async fetch(category: NotificationType, versionTag?: string): Promise<ResourceResponse> {
        return {
            content: JSON.stringify(category === 'startUp' ? this.startupNotifications : this.emergencyNotifications),
            eTag: 'DEVMODE',
        }
    }
}
