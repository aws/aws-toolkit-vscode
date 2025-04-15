/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChatItemType, ChatPrompt, MynahUI, NotificationType, MynahIcons } from '@aws/mynah-ui'
import { TabDataGenerator } from '../tabs/generator'
import { Connector } from '../connector'
import { TabsStorage, TabType } from '../storages/tabsStorage'
import { uiComponentsTexts } from '../texts/constants'

export interface QuickActionsHandlerProps {
    mynahUI: MynahUI
    connector: Connector
    tabsStorage: TabsStorage
    isFeatureDevEnabled: boolean
    isGumbyEnabled: boolean
    isScanEnabled: boolean
    isTestEnabled: boolean
    isDocEnabled: boolean
    disabledCommands?: string[]
}

export interface HandleCommandProps {
    tabID: string
    tabType: TabType
    isEnabled: boolean
    chatPrompt?: ChatPrompt
    eventId?: string
    taskName?: string
}
export class QuickActionHandler {
    private mynahUI: MynahUI
    private connector: Connector
    private tabsStorage: TabsStorage
    private tabDataGenerator: TabDataGenerator
    private isFeatureDevEnabled: boolean
    private isGumbyEnabled: boolean
    private isScanEnabled: boolean
    private isTestEnabled: boolean
    private isDocEnabled: boolean

    constructor(props: QuickActionsHandlerProps) {
        this.mynahUI = props.mynahUI
        this.connector = props.connector
        this.tabsStorage = props.tabsStorage
        this.isDocEnabled = props.isDocEnabled
        this.tabDataGenerator = new TabDataGenerator({
            isFeatureDevEnabled: props.isFeatureDevEnabled,
            isGumbyEnabled: props.isGumbyEnabled,
            isScanEnabled: props.isScanEnabled,
            isTestEnabled: props.isTestEnabled,
            isDocEnabled: props.isDocEnabled,
            disabledCommands: props.disabledCommands,
        })
        this.isFeatureDevEnabled = props.isFeatureDevEnabled
        this.isGumbyEnabled = props.isGumbyEnabled
        this.isScanEnabled = props.isScanEnabled
        this.isTestEnabled = props.isTestEnabled
    }

    /**
     * Handle commands
     * Inside of the welcome page commands update the current tab
     * Outside of the welcome page commands create new tabs
     */
    public handle(chatPrompt: ChatPrompt, tabID: string, eventId?: string) {
        this.tabsStorage.resetTabTimer(tabID)
        switch (chatPrompt.command) {
            case '/dev':
                this.handleCommand({
                    chatPrompt,
                    tabID,
                    taskName: 'Q - Dev',
                    tabType: 'featuredev',
                    isEnabled: this.isFeatureDevEnabled,
                })
                break
            case '/help':
                this.handleHelpCommand(tabID)
                break
            case '/transform':
                this.handleGumbyCommand(tabID, eventId)
                break
            case '/review':
                this.handleScanCommand(tabID, eventId)
                break
            case '/test':
                this.handleTestCommand(chatPrompt, tabID, eventId)
                break
            case '/doc':
                this.handleCommand({
                    chatPrompt,
                    tabID,
                    taskName: 'Q - Doc',
                    tabType: 'doc',
                    isEnabled: this.isDocEnabled,
                })
                break
            case '/clear':
                this.handleClearCommand(tabID)
                break
        }
    }

    /**
     * Common helper method to handle specialized tab commands (scan, test, transform)
     * @param options Configuration options for the specialized tab
     */
    private handleSpecializedTabCommand(options: {
        tabID: string // Current tab ID
        eventId?: string // Event ID for tracking
        isEnabled: boolean // Feature flag
        tabType: TabType // Type of tab to create/switch to
        existingTabType: TabType // Type to look for in existing tabs
        taskName?: string // Optional task name
        promptText?: string // Optional prompt text
        onExistingTab: (tabId: string) => void // Callback for existing tab
        onNewTab: (tabId: string) => void // Callback for new tab
    }): void {
        if (!options.isEnabled) {
            return
        }

        // Check if a tab of this type already exists
        let existingTabId: string | undefined = undefined
        for (const tab of this.tabsStorage.getTabs()) {
            if (tab.type === options.existingTabType) {
                existingTabId = tab.id
                break
            }
        }

        // If tab exists, select it and run the callback
        if (existingTabId !== undefined) {
            this.mynahUI.selectTab(existingTabId, options.eventId || '')
            this.connector.onTabChange(existingTabId)
            options.onExistingTab(existingTabId)
            return
        }

        // Otherwise, create a new tab
        let affectedTabId: string | undefined = options.tabID

        // If current tab is not unknown or welcome, create a new tab
        const currentTabType = this.tabsStorage.getTab(affectedTabId)?.type
        if (currentTabType !== 'unknown' && currentTabType !== 'welcome') {
            affectedTabId = this.mynahUI.updateStore('', {
                loadingChat: true,
            })
        }

        // Handle case where we can't create a new tab
        if (affectedTabId === undefined) {
            this.mynahUI.notify({
                content: uiComponentsTexts.noMoreTabsTooltip,
                type: NotificationType.WARNING,
            })
            return
        }

        // Set up the new tab
        this.tabsStorage.updateTabTypeFromUnknown(affectedTabId, options.tabType)
        this.connector.onKnownTabOpen(affectedTabId)
        this.connector.onUpdateTabType(affectedTabId)

        // Reset chat history
        this.mynahUI.updateStore(affectedTabId, {
            chatItems: [],
        })

        // Set tab data
        const isEmpty = options.promptText === undefined || options.promptText === ''
        this.mynahUI.updateStore(
            affectedTabId,
            this.tabDataGenerator.getTabData(options.tabType, isEmpty, options.taskName)
        )

        // Disable chat prompt while loading
        this.mynahUI.updateStore(affectedTabId, {
            loadingChat: true,
        })

        // Run the callback for the new tab
        options.onNewTab(affectedTabId)
    }

    private handleScanCommand(tabID: string, eventId: string | undefined) {
        this.handleSpecializedTabCommand({
            tabID,
            eventId,
            isEnabled: this.isScanEnabled,
            tabType: 'review',
            existingTabType: 'review',
            onExistingTab: (tabId) => {
                this.connector.scans(tabId)
            },
            onNewTab: (tabId) => {
                this.connector.scans(tabId)
            },
        })
    }

    private handleTestCommand(chatPrompt: ChatPrompt, tabID: string, eventId: string | undefined) {
        const realPromptText = chatPrompt.escapedPrompt?.trim() ?? ''

        this.handleSpecializedTabCommand({
            tabID,
            eventId,
            isEnabled: this.isTestEnabled,
            tabType: 'testgen',
            existingTabType: 'testgen',
            taskName: 'Q - Test',
            promptText: realPromptText,
            onExistingTab: (tabId) => {
                this.connector.startTestGen(tabId, realPromptText)
            },
            onNewTab: (tabId) => {
                this.connector.startTestGen(tabId, realPromptText)
            },
        })
    }

    private handleCommand(props: HandleCommandProps) {
        if (!props.isEnabled) {
            return
        }

        let affectedTabId: string | undefined = props.tabID
        const realPromptText = props.chatPrompt?.escapedPrompt?.trim() ?? ''
        const currentTabType = this.tabsStorage.getTab(affectedTabId)?.type
        if (currentTabType !== 'unknown' && currentTabType !== 'welcome') {
            affectedTabId = this.mynahUI.updateStore('', {})
        }
        if (affectedTabId === undefined) {
            this.mynahUI.notify({
                content: uiComponentsTexts.noMoreTabsTooltip,
                type: NotificationType.WARNING,
            })
            return
        } else {
            this.tabsStorage.updateTabTypeFromUnknown(affectedTabId, props.tabType)
            this.connector.onKnownTabOpen(affectedTabId)
            this.connector.onUpdateTabType(affectedTabId)

            this.mynahUI.updateStore(affectedTabId, { chatItems: [] })

            if (props.tabType === 'featuredev') {
                this.mynahUI.updateStore(
                    affectedTabId,
                    this.tabDataGenerator.getTabData(props.tabType, false, props.taskName)
                )
            } else {
                this.mynahUI.updateStore(
                    affectedTabId,
                    this.tabDataGenerator.getTabData(props.tabType, realPromptText === '', props.taskName)
                )
            }

            const addInformationCard = (tabId: string) => {
                if (props.tabType === 'featuredev') {
                    this.mynahUI.addChatItem(tabId, {
                        type: ChatItemType.ANSWER,
                        informationCard: {
                            title: 'Feature development',
                            description: 'Amazon Q Developer Agent for Software Development',
                            icon: MynahIcons.BUG,
                            content: {
                                body: [
                                    'After you provide a task, I will:',
                                    '1. Generate code based on your description and the code in your workspace',
                                    '2. Provide a list of suggestions for you to review and add to your workspace',
                                    '3. If needed, iterate based on your feedback',
                                    'To learn more, visit the [user guide](https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/software-dev.html)',
                                ].join('\n'),
                            },
                        },
                    })
                }
            }
            if (realPromptText !== '') {
                this.mynahUI.addChatItem(affectedTabId, {
                    type: ChatItemType.PROMPT,
                    body: realPromptText,
                })
                addInformationCard(affectedTabId)

                this.mynahUI.updateStore(affectedTabId, {
                    loadingChat: true,
                    promptInputDisabledState: true,
                })

                void this.connector.requestGenerativeAIAnswer(affectedTabId, '', {
                    chatMessage: realPromptText,
                })
            } else {
                addInformationCard(affectedTabId)
            }
        }
    }

    private handleGumbyCommand(tabID: string, eventId: string | undefined) {
        this.handleSpecializedTabCommand({
            tabID,
            eventId,
            isEnabled: this.isGumbyEnabled,
            tabType: 'gumby',
            existingTabType: 'gumby',
            onExistingTab: () => {
                // Nothing special to do for existing transform tab
            },
            onNewTab: (tabId) => {
                this.connector.transform(tabId)
            },
        })
    }

    private handleClearCommand(tabID: string) {
        this.mynahUI.updateStore(tabID, {
            chatItems: [],
        })
        this.connector.clearChat(tabID)
    }

    private handleHelpCommand(tabID: string) {
        // User entered help action, so change the tab type to 'cwc' if it's an unknown tab
        if (this.tabsStorage.getTab(tabID)?.type === 'unknown') {
            this.tabsStorage.updateTabTypeFromUnknown(tabID, 'cwc')
        }

        this.connector.help(tabID)
    }
}
