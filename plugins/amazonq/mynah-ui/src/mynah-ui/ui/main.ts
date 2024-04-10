/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { Connector } from './connector'
import { ChatItem, ChatItemType, MynahUI, MynahUIDataModel, NotificationType } from '@aws/mynah-ui-chat'
import './styles/dark.scss'
import { ChatPrompt } from '@aws/mynah-ui-chat/dist/static'
import { TabsStorage, TabType } from './storages/tabsStorage'
import { WelcomeFollowupType } from './apps/amazonqCommonsConnector'
import { TabDataGenerator } from './tabs/generator'
import { feedbackOptions } from './feedback/constants'
import { uiComponentsTexts } from './texts/constants'
import { FollowUpInteractionHandler } from './followUps/handler'
import { QuickActionHandler } from './quickActions/handler'
import { TextMessageHandler } from './messages/handler'
import { MessageController } from './messages/controller'
import {getActions, getDetails} from "./diffTree/actions";
import {DiffTreeFileInfo} from "./diffTree/types";

export const createMynahUI = (ideApi: any, featureDevInitEnabled: boolean, codeTransformInitEnabled: boolean) => {
    // eslint-disable-next-line prefer-const
    let mynahUI: MynahUI
    // eslint-disable-next-line prefer-const
    let connector: Connector
    const tabsStorage = new TabsStorage({
        onTabTimeout: tabID => {
            mynahUI.addChatItem(tabID, {
                type: ChatItemType.ANSWER,
                body: 'This conversation has timed out after 48 hours. It will not be saved. Start a new conversation.',
            })
            mynahUI.updateStore(tabID, {
                promptInputDisabledState: true,
                promptInputPlaceholder: 'Session ended.',
            })
        },
    })
    // Adding the first tab as CWC tab
    tabsStorage.addTab({
        id: 'tab-1',
        status: 'free',
        type: 'cwc',
        isSelected: true,
    })

    // used to keep track of whether featureDev is enabled and has an active idC
    let isFeatureDevEnabled = featureDevInitEnabled

    let isCodeTransformEnabled = codeTransformInitEnabled

    const tabDataGenerator = new TabDataGenerator({
        isFeatureDevEnabled,
        isCodeTransformEnabled,
    })

    // eslint-disable-next-line prefer-const
    let followUpsInteractionHandler: FollowUpInteractionHandler
    // eslint-disable-next-line prefer-const
    let quickActionHandler: QuickActionHandler
    // eslint-disable-next-line prefer-const
    let textMessageHandler: TextMessageHandler
    // eslint-disable-next-line prefer-const
    let messageController: MessageController

    // eslint-disable-next-line prefer-const
    connector = new Connector({
        tabsStorage,
        onUpdateAuthentication: (featureDevEnabled: boolean, codeTransformEnabled: boolean, authenticatingTabIDs: string[]): void => {
            isFeatureDevEnabled = featureDevEnabled
            isCodeTransformEnabled = codeTransformEnabled

            quickActionHandler.isFeatureDevEnabled = isFeatureDevEnabled
            quickActionHandler.isCodeTransformEnabled = isCodeTransformEnabled
            tabDataGenerator.quickActionsGenerator.isFeatureDevEnabled = isFeatureDevEnabled
            tabDataGenerator.quickActionsGenerator.isCodeTransformEnabled = isCodeTransformEnabled

            // Set the new defaults for the quick action commands in all tabs now that isFeatureDevEnabled and isCodeTransformEnabled were enabled/disabled
            for (const tab of tabsStorage.getTabs()) {
                mynahUI.updateStore(tab.id, {
                    quickActionCommands: tabDataGenerator.quickActionsGenerator.generateForTab(tab.type),
                })
            }

            // Unlock every authenticated tab that is now authenticated
            for (const tabID of authenticatingTabIDs) {
                const tabType = tabsStorage.getTab(tabID)?.type
                if (
                    (tabType === 'featuredev' && featureDevEnabled) ||
                    (tabType === 'codetransform' && codeTransformEnabled)
                ) {
                    mynahUI.addChatItem(tabID, {
                        type: ChatItemType.ANSWER,
                        body: 'Authentication successful. Connected to Amazon Q.',
                    })
                    mynahUI.updateStore(tabID, {
                        // Always disable prompt for code transform tabs
                        promptInputDisabledState: tabType === 'codetransform',
                    })
                }
            }
        },
        onFileActionClick: (tabID: string, messageId: string, filePath: string, actionName: string): void => {},
        onCWCOnboardingPageInteractionMessage: (message: ChatItem): string | undefined => {
            return messageController.sendMessageToTab(message, 'cwc')
        },
        onCWCContextCommandMessage: (message: ChatItem, command?: string): string | undefined => {
            if (command === 'aws.amazonq.sendToPrompt') {
                return messageController.sendSelectedCodeToTab(message)
            } else {
                return messageController.sendMessageToTab(message, 'cwc')
            }
        },
        onWelcomeFollowUpClicked: (tabID: string, welcomeFollowUpType: WelcomeFollowupType) => {
            followUpsInteractionHandler.onWelcomeFollowUpClicked(tabID, welcomeFollowUpType)
        },
        onChatInputEnabled: (tabID: string, enabled: boolean) => {
            mynahUI.updateStore(tabID, {
                promptInputDisabledState: tabsStorage.isTabDead(tabID) || !enabled,
            })
        },
        onAsyncEventProgress: (tabID: string, inProgress: boolean, message: string | undefined) => {
            if (inProgress) {
                mynahUI.updateStore(tabID, {
                    loadingChat: true,
                    promptInputDisabledState: true,
                })
                if (message) {
                    mynahUI.updateLastChatAnswer(tabID, {
                        body: message,
                    })
                }
                mynahUI.addChatItem(tabID, {
                    type: ChatItemType.ANSWER_STREAM,
                    body: '',
                })
                tabsStorage.updateTabStatus(tabID, 'busy')
                return
            }

            mynahUI.updateStore(tabID, {
                loadingChat: false,
                promptInputDisabledState: tabsStorage.isTabDead(tabID),
            })
            tabsStorage.updateTabStatus(tabID, 'free')
        },
        onCodeTransformChatDisabled: (tabID: string) => {
            // Clear the chat window to prevent button clicks or form selections
            mynahUI.updateStore(tabID, {
                loadingChat: false,
                chatItems: [],
            })
        },
        onCodeTransformMessageReceived: (tabID: string, chatItem: ChatItem) => {
            if (chatItem.type === ChatItemType.ANSWER_PART) {
                mynahUI.updateLastChatAnswer(tabID, {
                    ...(chatItem.messageId !== undefined ? { messageId: chatItem.messageId } : {}),
                    ...(chatItem.canBeVoted !== undefined ? { canBeVoted: chatItem.canBeVoted } : {}),
                    ...(chatItem.codeReference !== undefined ? { codeReference: chatItem.codeReference } : {}),
                    ...(chatItem.body !== undefined ? { body: chatItem.body } : {}),
                    ...(chatItem.relatedContent !== undefined ? { relatedContent: chatItem.relatedContent } : {}),
                    ...(chatItem.formItems !== undefined ? { formItems: chatItem.formItems} : {}),
                    ...(chatItem.buttons !== undefined ? { buttons: chatItem.buttons} : {buttons: []}),
                    // For loading animation to work, do not update the chat item type
                    ...(chatItem.followUp !== undefined ? { followUp: chatItem.followUp} : {}),
                })

                return
            }

            if (chatItem.type === ChatItemType.PROMPT || chatItem.type === ChatItemType.ANSWER_STREAM || chatItem.type === ChatItemType.ANSWER) {
                if (chatItem.followUp === undefined) {
                    mynahUI.updateLastChatAnswer(tabID, {
                        buttons: [],
                        followUp: { options: [] },
                    })
                }

                mynahUI.addChatItem(tabID, chatItem)
                mynahUI.updateStore(tabID, {
                    loadingChat: chatItem.type !== ChatItemType.ANSWER,
                })

                if (chatItem.type === ChatItemType.PROMPT) {
                    tabsStorage.updateTabStatus(tabID, 'busy')
                } else if (chatItem.type === ChatItemType.ANSWER) {
                    tabsStorage.updateTabStatus(tabID, 'free')
                }
            }
        },
        onNotification: (notification: {
            content: string;
            title?: string;
            type: NotificationType;
        }) => {
            mynahUI.notify(notification)
        },
        onCodeTransformCommandMessageReceived: (_message: ChatItem, command?: string) => {
            if (command === 'stop') {
                const codeTransformTab = tabsStorage.getTabs().find((tab) => tab.type === 'codetransform')
                if (codeTransformTab !== undefined && codeTransformTab.isSelected) {
                    return
                }

                mynahUI.notify({
                    type: NotificationType.INFO,
                    title: 'Q - Transform',
                    content: `Amazon Q is stopping your transformation. To view progress in the Q - Transform tab, click anywhere on this notification.`,
                    duration: 10000,
                    onNotificationClick: (eventId) => {
                        if (codeTransformTab !== undefined) {
                            // Click to switch to the opened code transform tab
                            mynahUI.selectTab(codeTransformTab.id, eventId)
                        } else {
                            // Click to open a new code transform tab
                            quickActionHandler.handle({ command: '/transform' }, '', eventId)
                        }
                    }
                })
            }
        },
        sendMessageToExtension: message => {
            ideApi.postMessage(message)
        },
        onChatAnswerReceived: (tabID: string, item: ChatItem) => {
            if (item.type === ChatItemType.ANSWER_PART || item.type === ChatItemType.CODE_RESULT) {
                mynahUI.updateLastChatAnswer(tabID, {
                    ...(item.messageId !== undefined ? { messageId: item.messageId } : {}),
                    ...(item.canBeVoted !== undefined ? { canBeVoted: item.canBeVoted } : {}),
                    ...(item.codeReference !== undefined ? { codeReference: item.codeReference } : {}),
                    ...(item.body !== undefined ? { body: item.body } : {}),
                    ...(item.relatedContent !== undefined ? { relatedContent: item.relatedContent } : {}),
                    ...(item.type === ChatItemType.CODE_RESULT
                        ? { type: ChatItemType.CODE_RESULT, fileList: item.fileList }
                        : {}),
                })
                return
            }

            if (item.body !== undefined || item.relatedContent !== undefined || item.followUp !== undefined) {
                mynahUI.addChatItem(tabID, item)
            }

            if (
                item.type === ChatItemType.PROMPT ||
                item.type === ChatItemType.SYSTEM_PROMPT ||
                item.type === ChatItemType.AI_PROMPT
            ) {
                mynahUI.updateStore(tabID, {
                    loadingChat: true,
                    promptInputDisabledState: true,
                })

                tabsStorage.updateTabStatus(tabID, 'busy')
                return
            }

            if (item.type === ChatItemType.ANSWER) {
                mynahUI.updateStore(tabID, {
                    loadingChat: false,
                    promptInputDisabledState: tabsStorage.isTabDead(tabID),
                })
                tabsStorage.updateTabStatus(tabID, 'free')
            }
        },
        onMessageReceived: (tabID: string, messageData: MynahUIDataModel) => {
            mynahUI.updateStore(tabID, messageData)
        },
        onFileComponentUpdate: (tabID: string, filePaths: DiffTreeFileInfo[], deletedFiles: DiffTreeFileInfo[]) => {
            const updateWith: Partial<ChatItem> = {
                type: ChatItemType.CODE_RESULT,
                fileList: {
                    filePaths: filePaths.map(i => i.zipFilePath),
                    deletedFiles: deletedFiles.map(i => i.zipFilePath),
                    details: getDetails(filePaths),
                    actions: getActions([...filePaths, ...deletedFiles]),
                },
            }
            mynahUI.updateLastChatAnswer(tabID, updateWith)
        },
        onWarning: (tabID: string, message: string, title: string) => {
            mynahUI.notify({
                title: title,
                content: message,
                type: NotificationType.WARNING,
            })
            mynahUI.updateStore(tabID, {
                loadingChat: false,
                promptInputDisabledState: tabsStorage.isTabDead(tabID),
            })
            tabsStorage.updateTabStatus(tabID, 'free')
        },
        onError: (tabID: string, message: string, title: string) => {
            const answer: ChatItem = {
                type: ChatItemType.ANSWER,
                body: `**${title}** 
 ${message}`,
            }

            if (tabID !== '') {
                mynahUI.updateStore(tabID, {
                    loadingChat: false,
                    promptInputDisabledState: tabsStorage.isTabDead(tabID),
                })
                tabsStorage.updateTabStatus(tabID, 'free')

                mynahUI.addChatItem(tabID, answer)
            } else {
                const newTabId = mynahUI.updateStore('', {
                    tabTitle: 'Error',
                    quickActionCommands: [],
                    promptInputPlaceholder: '',
                    chatItems: [answer],
                })
                if (newTabId === undefined) {
                    mynahUI.notify({
                        content: uiComponentsTexts.noMoreTabsTooltip,
                        type: NotificationType.WARNING,
                    })
                    return
                } else {
                    // TODO remove this since it will be added with the onTabAdd and onTabAdd is now sync,
                    // It means that it cannot trigger after the updateStore function returns.
                    tabsStorage.addTab({
                        id: newTabId,
                        status: 'busy',
                        type: 'cwc',
                        isSelected: true,
                    })
                }
            }
            return
        },
        onUpdatePlaceholder(tabID: string, newPlaceholder: string) {
            mynahUI.updateStore(tabID, {
                promptInputPlaceholder: newPlaceholder,
            })
        },
        onNewTab(tabType: TabType) {
            const newTabID = mynahUI.updateStore('', {})
            if (!newTabID) {
                return
            }

            tabsStorage.updateTabTypeFromUnknown(newTabID, tabType)
            connector.onKnownTabOpen(newTabID)
            connector.onUpdateTabType(newTabID)

            mynahUI.updateStore(newTabID, tabDataGenerator.getTabData(tabType, true))
        },
        onStartNewTransform(tabID: string) {
            mynahUI.updateStore(tabID, { chatItems: [] })
            mynahUI.updateStore(tabID, tabDataGenerator.getTabData("codetransform", true))
        },
    })

    mynahUI = new MynahUI({
        onReady: connector.uiReady,
        onTabAdd: (tabID: string) => {
            // If featureDev or gumby has changed availability inbetween the default store settings and now
            // make sure to show/hide it accordingly
            mynahUI.updateStore(tabID, {
                quickActionCommands: tabDataGenerator.quickActionsGenerator.generateForTab('unknown'),
            })
            connector.onTabAdd(tabID)
        },
        onTabRemove: connector.onTabRemove,
        onTabChange: connector.onTabChange,
        onChatPrompt: (tabID, prompt, eventId) => {
            if ((prompt.prompt ?? '') === '' && (prompt.command ?? '') === '') {
                return
            }

            if (tabsStorage.getTab(tabID)?.type === 'featuredev') {
                mynahUI.addChatItem(tabID, {
                    type: ChatItemType.ANSWER_STREAM,
                })
            }

            if (prompt.command !== undefined && prompt.command.trim() !== '') {
                quickActionHandler.handle(prompt, tabID, eventId)
                return
            }

            textMessageHandler.handle(prompt, tabID)
        },
        onVote: connector.onChatItemVoted,
        onSendFeedback: (tabId, feedbackPayload) => {
            connector.sendFeedback(tabId, feedbackPayload)
            mynahUI.notify({
                type: NotificationType.INFO,
                title: 'Your feedback is sent',
                content: 'Thanks for your feedback.',
            })
        },
        onCodeInsertToCursorPosition: connector.onCodeInsertToCursorPosition,
        onCopyCodeToClipboard: (tabId, messageId, code, type, referenceTrackerInfo) => {
            connector.onCopyCodeToClipboard(tabId, messageId, code, type, referenceTrackerInfo)
            mynahUI.notify({
                type: NotificationType.SUCCESS,
                content: 'Selected code is copied to clipboard',
            })
        },
        onChatItemEngagement: connector.triggerSuggestionEngagement,
        onSourceLinkClick: (tabId, messageId, link, mouseEvent) => {
            mouseEvent?.preventDefault()
            mouseEvent?.stopPropagation()
            mouseEvent?.stopImmediatePropagation()
            connector.onSourceLinkClick(tabId, messageId, link)
        },
        onLinkClick: (tabId, messageId, link, mouseEvent) => {
            mouseEvent?.preventDefault()
            mouseEvent?.stopPropagation()
            mouseEvent?.stopImmediatePropagation()
            connector.onResponseBodyLinkClick(tabId, messageId, link)
        },
        onInfoLinkClick: (tabId: string, link: string, mouseEvent?: MouseEvent) => {
            mouseEvent?.preventDefault()
            mouseEvent?.stopPropagation()
            mouseEvent?.stopImmediatePropagation()
            connector.onInfoLinkClick(tabId, link)
        },
        onResetStore: () => {},
        onFollowUpClicked: (tabID, messageId, followUp) => {
            followUpsInteractionHandler.onFollowUpClicked(tabID, messageId, followUp)
        },
        onFileActionClick: async (tabID: string, messageId: string, filePath: string, actionName: string) => {
            connector.onFileActionClick(tabID, messageId, filePath, actionName)
        },
        onOpenDiff: connector.onOpenDiff,
        tabs: {
            'tab-1': {
                isSelected: true,
                store: tabDataGenerator.getTabData('cwc', true),
            },
        },
        onInBodyButtonClicked: (tabId, messageId, action) => {
            connector.onFormButtonClick(tabId, messageId, action)
        },
        defaults: {
            store: tabDataGenerator.getTabData('cwc', true),
        },
        config: {
            maxTabs: 10,
            feedbackOptions: feedbackOptions,
            texts: uiComponentsTexts,
        },
    })

    followUpsInteractionHandler = new FollowUpInteractionHandler({
        mynahUI,
        connector,
        tabsStorage,
    })
    quickActionHandler = new QuickActionHandler({
        mynahUI,
        connector,
        tabsStorage,
        isFeatureDevEnabled,
        isCodeTransformEnabled,
    })
    textMessageHandler = new TextMessageHandler({
        mynahUI,
        connector,
        tabsStorage,
    })
    messageController = new MessageController({
        mynahUI,
        connector,
        tabsStorage,
        isFeatureDevEnabled,
        isCodeTransformEnabled,
    })
}
