/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { Connector, CWCChatItem } from './connector'
import {
    ChatItem,
    ChatItemType,
    CodeSelectionType,
    MynahIcons,
    MynahUI,
    MynahUIDataModel,
    NotificationType,
    ReferenceTrackerInformation,
} from '@aws/mynah-ui'
import { ChatPrompt } from '@aws/mynah-ui/dist/static'
import { TabsStorage, TabType } from './storages/tabsStorage'
import { WelcomeFollowupType } from './apps/amazonqCommonsConnector'
import { TabDataGenerator } from './tabs/generator'
import { feedbackOptions } from './feedback/constants'
import { uiComponentsTexts } from './texts/constants'
import { FollowUpInteractionHandler } from './followUps/handler'
import { QuickActionHandler } from './quickActions/handler'
import { TextMessageHandler } from './messages/handler'
import { MessageController } from './messages/controller'
import { getActions, getDetails } from './diffTree/actions'
import { DiffTreeFileInfo } from './diffTree/types'
import { FeatureContext } from '../../../shared'
import { tryNewMap } from '../../util/functionUtils'

export const createMynahUI = (
    ideApi: any,
    amazonQEnabled: boolean,
    featureConfigsSerialized: [string, FeatureContext][]
) => {
    // eslint-disable-next-line prefer-const
    let mynahUI: MynahUI
    // eslint-disable-next-line prefer-const
    let connector: Connector
    //Store the mapping between messageId and messageUserIntent for amazonq_interactWithMessage telemetry
    const responseMetadata = new Map<string, string[]>()

    window.addEventListener('error', (e) => {
        const { error, message } = e
        ideApi.postMessage({
            type: 'error',
            event: connector.isUIReady ? 'webview_error' : 'webview_load',
            errorMessage: error ? error.toString() : message,
        })
    })

    const tabsStorage = new TabsStorage({
        onTabTimeout: (tabID) => {
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

    // used to keep track of whether or not featureDev is enabled and has an active idC
    let isFeatureDevEnabled = amazonQEnabled

    let isGumbyEnabled = amazonQEnabled

    let tabDataGenerator = new TabDataGenerator({
        isFeatureDevEnabled,
        isGumbyEnabled,
    })

    // eslint-disable-next-line prefer-const
    let followUpsInteractionHandler: FollowUpInteractionHandler
    // eslint-disable-next-line prefer-const
    let quickActionHandler: QuickActionHandler
    // eslint-disable-next-line prefer-const
    let textMessageHandler: TextMessageHandler
    // eslint-disable-next-line prefer-const
    let messageController: MessageController

    let featureConfigs: Map<string, FeatureContext> = tryNewMap(featureConfigsSerialized)

    function shouldDisplayDiff(messageData: any) {
        const isEnabled = featureConfigs.get('ViewDiffInChat')?.variation === 'TREATMENT'
        const tab = tabsStorage.getTab(messageData?.tabID || '')
        const allowedCommands = [
            'aws.amazonq.refactorCode',
            'aws.amazonq.fixCode',
            'aws.amazonq.optimizeCode',
            'aws.amazonq.sendToPrompt',
        ]
        if (isEnabled && tab?.type === 'cwc' && allowedCommands.includes(tab.lastCommand || '')) {
            return true
        }
        return false
    }

    // eslint-disable-next-line prefer-const
    connector = new Connector({
        tabsStorage,
        onUpdateAuthentication: (isAmazonQEnabled: boolean, authenticatingTabIDs: string[]): void => {
            isFeatureDevEnabled = isAmazonQEnabled
            isGumbyEnabled = isAmazonQEnabled

            quickActionHandler = new QuickActionHandler({
                mynahUI,
                connector,
                tabsStorage,
                isFeatureDevEnabled,
                isGumbyEnabled,
            })

            tabDataGenerator = new TabDataGenerator({
                isFeatureDevEnabled,
                isGumbyEnabled,
            })

            featureConfigs = tryNewMap(featureConfigsSerialized)

            // Set the new defaults for the quick action commands in all tabs now that isFeatureDevEnabled was enabled/disabled
            for (const tab of tabsStorage.getTabs()) {
                mynahUI.updateStore(tab.id, {
                    quickActionCommands: tabDataGenerator.quickActionsGenerator.generateForTab(tab.type),
                })
            }

            // Unlock every authenticated tab that is now authenticated
            if (isAmazonQEnabled) {
                for (const tabID of authenticatingTabIDs) {
                    mynahUI.addChatItem(tabID, {
                        type: ChatItemType.ANSWER,
                        body: 'Authentication successful. Connected to Amazon Q.',
                    })

                    if (tabsStorage.getTab(tabID)?.type === 'gumby') {
                        mynahUI.updateStore(tabID, {
                            promptInputDisabledState: false,
                        })
                    }
                }
            }
        },
        onFileActionClick: (tabID: string, messageId: string, filePath: string, actionName: string): void => {},
        onQuickHandlerCommand: (tabID: string, command?: string, eventId?: string) => {
            tabsStorage.updateTabLastCommand(tabID, command)
            if (command === 'aws.awsq.transform') {
                quickActionHandler.handle({ command: '/transform' }, tabID, eventId)
            } else if (command === 'aws.awsq.clearchat') {
                quickActionHandler.handle({ command: '/clear' }, tabID)
            }
        },
        onCWCContextCommandMessage: (message: ChatItem, command?: string): string | undefined => {
            const selectedTab = tabsStorage.getSelectedTab()
            tabsStorage.updateTabLastCommand(selectedTab?.id || '', command || '')

            if (command === 'aws.amazonq.sendToPrompt') {
                return messageController.sendSelectedCodeToTab(message, command)
            } else {
                const tabID = messageController.sendMessageToTab(message, 'cwc', command)
                if (tabID) {
                    ideApi.postMessage({
                        command: 'start-chat-message-telemetry',
                        trigger: 'onContextCommand',
                        tabID,
                        tabType: 'cwc',
                        startTime: Date.now(),
                    })
                }
                return tabID
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
        onAsyncEventProgress: (
            tabID: string,
            inProgress: boolean,
            message: string | undefined,
            messageId: string | undefined = undefined
        ) => {
            if (inProgress) {
                mynahUI.updateStore(tabID, {
                    loadingChat: true,
                    promptInputDisabledState: true,
                    cancelButtonWhenLoading: true,
                })

                if (message && messageId) {
                    mynahUI.updateChatAnswerWithMessageId(tabID, messageId, {
                        body: message,
                    })
                } else if (message) {
                    mynahUI.updateLastChatAnswer(tabID, {
                        body: message,
                    })
                } else {
                    mynahUI.addChatItem(tabID, {
                        type: ChatItemType.ANSWER_STREAM,
                        body: '',
                        messageId: messageId,
                    })
                }
                tabsStorage.updateTabStatus(tabID, 'busy')
                return
            }

            mynahUI.updateStore(tabID, {
                loadingChat: false,
                promptInputDisabledState: tabsStorage.isTabDead(tabID),
            })
            tabsStorage.updateTabStatus(tabID, 'free')
        },
        sendMessageToExtension: (message) => {
            ideApi.postMessage(message)
        },
        onChatAnswerUpdated: (tabID: string, item: ChatItem) => {
            if (item.messageId !== undefined) {
                mynahUI.updateChatAnswerWithMessageId(tabID, item.messageId, {
                    ...(item.body !== undefined ? { body: item.body } : {}),
                    ...(item.buttons !== undefined ? { buttons: item.buttons } : {}),
                })
            } else {
                mynahUI.updateLastChatAnswer(tabID, {
                    ...(item.body !== undefined ? { body: item.body } : {}),
                    ...(item.buttons !== undefined ? { buttons: item.buttons } : {}),
                } as ChatItem)
            }
        },
        onChatAnswerReceived: (tabID: string, item: CWCChatItem, messageData: any) => {
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
                if (
                    item.messageId !== undefined &&
                    item.userIntent !== undefined &&
                    item.codeBlockLanguage !== undefined
                ) {
                    responseMetadata.set(item.messageId, [item.userIntent, item.codeBlockLanguage])
                }
                ideApi.postMessage({
                    command: 'update-chat-message-telemetry',
                    tabID,
                    tabType: tabsStorage.getTab(tabID)?.type,
                    time: Date.now(),
                })
                return
            }

            if (
                item.body !== undefined ||
                item.relatedContent !== undefined ||
                item.followUp !== undefined ||
                item.formItems !== undefined ||
                item.buttons !== undefined
            ) {
                mynahUI.addChatItem(tabID, {
                    ...item,
                    messageId: item.messageId,
                    codeBlockActions: {
                        ...(shouldDisplayDiff(messageData)
                            ? {
                                  'insert-to-cursor': undefined,
                                  accept_diff: {
                                      id: 'accept_diff',
                                      label: 'Apply Diff',
                                      icon: MynahIcons.OK_CIRCLED,
                                      data: messageData,
                                  },
                                  view_diff: {
                                      id: 'view_diff',
                                      label: 'View Diff',
                                      icon: MynahIcons.EYE,
                                      data: messageData,
                                  },
                              }
                            : {}),
                    },
                })
            }

            if (
                item.type === ChatItemType.PROMPT ||
                item.type === ChatItemType.SYSTEM_PROMPT ||
                item.type === ChatItemType.AI_PROMPT
            ) {
                mynahUI.updateStore(tabID, {
                    loadingChat: true,
                    cancelButtonWhenLoading: false,
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

                /**
                 * We've received an answer for a tabID and this message has
                 * completed its round trip. Send that information back to
                 * VSCode so we can emit a round trip event
                 **/
                ideApi.postMessage({
                    command: 'stop-chat-message-telemetry',
                    tabID,
                    tabType: tabsStorage.getTab(tabID)?.type,
                    time: Date.now(),
                })
            }
        },
        onMessageReceived: (tabID: string, messageData: MynahUIDataModel) => {
            mynahUI.updateStore(tabID, messageData)
        },
        onFileComponentUpdate: (
            tabID: string,
            filePaths: DiffTreeFileInfo[],
            deletedFiles: DiffTreeFileInfo[],
            messageId: string
        ) => {
            const updateWith: Partial<ChatItem> = {
                type: ChatItemType.ANSWER,
                fileList: {
                    rootFolderTitle: 'Changes',
                    filePaths: filePaths.map((i) => i.zipFilePath),
                    deletedFiles: deletedFiles.map((i) => i.zipFilePath),
                    details: getDetails(filePaths),
                    actions: getActions([...filePaths, ...deletedFiles]),
                },
            }
            mynahUI.updateChatAnswerWithMessageId(tabID, messageId, updateWith)
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
            featureConfigs = tryNewMap(featureConfigsSerialized)
        },
        onOpenSettingsMessage(tabId: string) {
            mynahUI.addChatItem(tabId, {
                type: ChatItemType.ANSWER,
                body: `To add your workspace as context, enable local indexing in your IDE settings. After enabling, add @workspace to your question, and I'll generate a response using your workspace as context.`,
                buttons: [
                    {
                        id: 'open-settings',
                        text: 'Open settings',
                        icon: MynahIcons.EXTERNAL,
                        keepCardAfterClick: false,
                        status: 'info',
                    },
                ],
            })
            tabsStorage.updateTabStatus(tabId, 'free')
            mynahUI.updateStore(tabId, {
                loadingChat: false,
                promptInputDisabledState: tabsStorage.isTabDead(tabId),
            })
            return
        },
    })

    mynahUI = new MynahUI({
        onReady: connector.uiReady,
        onTabAdd: (tabID: string) => {
            // If featureDev has changed availability inbetween the default store settings and now
            // make sure to show/hide it accordingly
            mynahUI.updateStore(tabID, {
                quickActionCommands: tabDataGenerator.quickActionsGenerator.generateForTab('unknown'),
            })
            connector.onTabAdd(tabID)
        },
        onTabRemove: connector.onTabRemove,
        onTabChange: connector.onTabChange,
        // TODO: update mynah-ui this type doesn't seem correct https://github.com/aws/mynah-ui/blob/3777a39eb534a91fd6b99d6cf421ce78ee5c7526/src/main.ts#L372
        onStopChatResponse: (tabID: string) => {
            mynahUI.updateStore(tabID, {
                loadingChat: false,
                promptInputDisabledState: false,
            })
            connector.onStopChatResponse(tabID)
        },
        onChatPrompt: (tabID: string, prompt: ChatPrompt, eventId: string | undefined) => {
            if ((prompt.prompt ?? '') === '' && (prompt.command ?? '') === '') {
                return
            }

            if (tabsStorage.getTab(tabID)?.type === 'featuredev') {
                mynahUI.addChatItem(tabID, {
                    type: ChatItemType.ANSWER_STREAM,
                })
            } else if (tabsStorage.getTab(tabID)?.type === 'gumby') {
                connector.requestAnswer(tabID, {
                    chatMessage: prompt.prompt ?? '',
                })
                return
            }

            if (prompt.command !== undefined && prompt.command.trim() !== '') {
                quickActionHandler.handle(prompt, tabID, eventId)
                return
            }

            textMessageHandler.handle(prompt, tabID, eventId as string)
        },
        onVote: connector.onChatItemVoted,
        onInBodyButtonClicked: (tabId, messageId, action, eventId) => {
            connector.onCustomFormAction(tabId, messageId, action, eventId)
        },
        onCustomFormAction: (tabId, action, eventId) => {
            connector.onCustomFormAction(tabId, undefined, action, eventId)
        },
        onSendFeedback: (tabId, feedbackPayload) => {
            connector.sendFeedback(tabId, feedbackPayload)
            mynahUI.notify({
                type: NotificationType.INFO,
                title: 'Your feedback is sent',
                content: 'Thanks for your feedback.',
            })
        },
        onCodeInsertToCursorPosition: (
            tabId,
            messageId,
            code,
            type,
            referenceTrackerInfo,
            eventId,
            codeBlockIndex,
            totalCodeBlocks
        ) => {
            connector.onCodeInsertToCursorPosition(
                tabId,
                messageId,
                code,
                type,
                referenceTrackerInfo,
                eventId,
                codeBlockIndex,
                totalCodeBlocks,
                responseMetadata.get(messageId)?.[0] ?? undefined,
                responseMetadata.get(messageId)?.[1] ?? undefined
            )
        },
        onCodeBlockActionClicked: (
            tabId: string,
            messageId: string,
            actionId: string,
            data?: string,
            code?: string,
            type?: CodeSelectionType,
            referenceTrackerInformation?: ReferenceTrackerInformation[],
            eventId?: string,
            codeBlockIndex?: number,
            totalCodeBlocks?: number
        ) => {
            switch (actionId) {
                case 'accept_diff':
                    connector.onAcceptDiff(
                        tabId,
                        messageId,
                        actionId,
                        data,
                        code,
                        type,
                        referenceTrackerInformation,
                        eventId,
                        codeBlockIndex,
                        totalCodeBlocks
                    )
                    break
                case 'view_diff':
                    connector.onViewDiff(
                        tabId,
                        messageId,
                        actionId,
                        data,
                        code,
                        type,
                        referenceTrackerInformation,
                        eventId,
                        codeBlockIndex,
                        totalCodeBlocks
                    )
                    break
                default:
                    break
            }
        },
        onCopyCodeToClipboard: (
            tabId,
            messageId,
            code,
            type,
            referenceTrackerInfo,
            eventId,
            codeBlockIndex,
            totalCodeBlocks
        ) => {
            connector.onCopyCodeToClipboard(
                tabId,
                messageId,
                code,
                type,
                referenceTrackerInfo,
                eventId,
                codeBlockIndex,
                totalCodeBlocks,
                responseMetadata.get(messageId)?.[0] ?? undefined,
                responseMetadata.get(messageId)?.[1] ?? undefined
            )
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
        isGumbyEnabled,
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
        isGumbyEnabled,
    })

    return {
        mynahUI,
        messageReceiver: connector.handleMessageReceive,
    }
}
