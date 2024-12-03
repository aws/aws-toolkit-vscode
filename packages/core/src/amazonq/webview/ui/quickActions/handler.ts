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

    private handleScanCommand(tabID: string, eventId: string | undefined) {
        if (!this.isScanEnabled) {
            return
        }
        let scanTabId: string | undefined = undefined

        this.tabsStorage.getTabs().forEach((tab) => {
            if (tab.type === 'review') {
                scanTabId = tab.id
            }
        })

        if (scanTabId !== undefined) {
            this.mynahUI.selectTab(scanTabId, eventId || '')
            this.connector.onTabChange(scanTabId)
            this.connector.scans(scanTabId)
            return
        }

        let affectedTabId: string | undefined = tabID
        // if there is no scan tab, open a new one
        const currentTabType = this.tabsStorage.getTab(affectedTabId)?.type
        if (currentTabType !== 'unknown' && currentTabType !== 'welcome') {
            affectedTabId = this.mynahUI.updateStore('', {
                loadingChat: true,
            })
        }

        if (affectedTabId === undefined) {
            this.mynahUI.notify({
                content: uiComponentsTexts.noMoreTabsTooltip,
                type: NotificationType.WARNING,
            })
            return
        } else {
            this.tabsStorage.updateTabTypeFromUnknown(affectedTabId, 'review')
            this.connector.onKnownTabOpen(affectedTabId)
            this.connector.onUpdateTabType(affectedTabId)

            // reset chat history
            this.mynahUI.updateStore(affectedTabId, {
                chatItems: [],
            })

            this.mynahUI.updateStore(affectedTabId, this.tabDataGenerator.getTabData('review', true, undefined)) // creating a new tab and printing some title

            // disable chat prompt
            this.mynahUI.updateStore(affectedTabId, {
                loadingChat: true,
            })
            this.connector.scans(affectedTabId)
        }
    }

    private handleTestCommand(chatPrompt: ChatPrompt, tabID: string, eventId: string | undefined) {
        if (!this.isTestEnabled) {
            return
        }
        const testTabId = this.tabsStorage.getTabs().find((tab) => tab.type === 'testgen')?.id
        const realPromptText = chatPrompt.escapedPrompt?.trim() ?? ''

        if (testTabId !== undefined) {
            this.mynahUI.selectTab(testTabId, eventId || '')
            this.connector.onTabChange(testTabId)
            this.connector.startTestGen(testTabId, realPromptText)
            return
        }

        let affectedTabId: string | undefined = tabID
        // if there is no test tab, open a new one
        const currentTabType = this.tabsStorage.getTab(affectedTabId)?.type
        if (currentTabType !== 'unknown' && currentTabType !== 'welcome') {
            affectedTabId = this.mynahUI.updateStore('', {
                loadingChat: true,
            })
        }

        if (affectedTabId === undefined) {
            this.mynahUI.notify({
                content: uiComponentsTexts.noMoreTabsTooltip,
                type: NotificationType.WARNING,
            })
            return
        } else {
            this.tabsStorage.updateTabTypeFromUnknown(affectedTabId, 'testgen')
            this.connector.onKnownTabOpen(affectedTabId)
            this.connector.onUpdateTabType(affectedTabId)

            // reset chat history
            this.mynahUI.updateStore(affectedTabId, {
                chatItems: [],
            })

            // creating a new tab and printing some title
            this.mynahUI.updateStore(
                affectedTabId,
                this.tabDataGenerator.getTabData('testgen', realPromptText === '', 'Q - Test')
            )

            this.connector.startTestGen(affectedTabId, realPromptText)
        }
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
                    cancelButtonWhenLoading: false,
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
        if (!this.isGumbyEnabled) {
            return
        }

        let gumbyTabId: string | undefined = undefined

        this.tabsStorage.getTabs().forEach((tab) => {
            if (tab.type === 'gumby') {
                gumbyTabId = tab.id
            }
        })

        if (gumbyTabId !== undefined) {
            this.mynahUI.selectTab(gumbyTabId, eventId || '')
            this.connector.onTabChange(gumbyTabId)
            return
        }

        let affectedTabId: string | undefined = tabID
        // if there is no gumby tab, open a new one
        const currentTabType = this.tabsStorage.getTab(affectedTabId)?.type
        if (currentTabType !== 'unknown' && currentTabType !== 'welcome') {
            affectedTabId = this.mynahUI.updateStore('', {
                loadingChat: true,
                cancelButtonWhenLoading: false,
            })
        }

        if (affectedTabId === undefined) {
            this.mynahUI.notify({
                content: uiComponentsTexts.noMoreTabsTooltip,
                type: NotificationType.WARNING,
            })
            return
        } else {
            this.tabsStorage.updateTabTypeFromUnknown(affectedTabId, 'gumby')
            this.connector.onKnownTabOpen(affectedTabId)
            this.connector.onUpdateTabType(affectedTabId)

            // reset chat history
            this.mynahUI.updateStore(affectedTabId, {
                chatItems: [],
            })

            this.mynahUI.updateStore(affectedTabId, this.tabDataGenerator.getTabData('gumby', true, undefined))

            // disable chat prompt
            this.mynahUI.updateStore(affectedTabId, {
                loadingChat: true,
                cancelButtonWhenLoading: false,
            })

            this.connector.transform(affectedTabId)
        }
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
