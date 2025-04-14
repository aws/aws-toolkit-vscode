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
    MynahUIProps,
    MynahUIDataModel,
    NotificationType,
    ReferenceTrackerInformation,
    ProgressField,
    ChatItemButton,
    ChatItemFormItem,
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
import { FeatureContext } from '../../../shared/featureConfig'
import { tryNewMap } from '../../util/functionUtils'
import { welcomeScreenTabData } from './walkthrough/welcome'
import { agentWalkthroughDataModel } from './walkthrough/agent'
import { createClickTelemetry, createOpenAgentTelemetry } from './telemetry/actions'
import { disclaimerAcknowledgeButtonId, disclaimerCard } from './texts/disclaimer'
import { DetailedListSheetProps } from '@aws/mynah-ui/dist/components/detailed-list/detailed-list-sheet'
import { RegionProfile } from '../../../codewhisperer/models/model'

/**
 * The number of welcome chat tabs that can be opened before the NEXT one will become
 * a regular chat tab.
 */
const welcomeCountThreshold = 3

export const createMynahUI = (
    ideApi: any,
    amazonQEnabled: boolean,
    featureConfigsSerialized: [string, FeatureContext][],
    welcomeCount: number,
    disclaimerAcknowledged: boolean,
    regionProfile: RegionProfile | undefined,
    disabledCommands?: string[],
    isSMUS?: boolean,
    isSM?: boolean
) => {
    const handler = new WebviewUIHandler({
        postMessage: ideApi.postMessage,
        mynahUI: undefined,
        enableAgents: amazonQEnabled,
        featureConfigsSerialized,
        welcomeCount,
        disclaimerAcknowledged,
        regionProfile,
        disabledCommands,
        isSMUS,
        isSM,
    })

    return {
        mynahUI: handler.mynahUI,
        messageReceiver: handler.connector?.handleMessageReceive,
    }
}

export class WebviewUIHandler {
    postMessage: any
    welcomeCount: number
    disclaimerCardActive: boolean

    featureConfigs?: Map<string, FeatureContext>
    // Store the mapping between messageId and messageUserIntent for amazonq_interactWithMessage telemetry
    responseMetadata: Map<string, string[]>

    tabsStorage: TabsStorage

    _mynahUI?: MynahUI
    mynahUIProps?: MynahUIProps
    connector?: Connector
    tabDataGenerator?: TabDataGenerator

    // are agents enabled
    isFeatureDevEnabled: boolean
    isGumbyEnabled: boolean
    isScanEnabled: boolean
    isTestEnabled: boolean
    isDocEnabled: boolean

    isSMUS: boolean
    isSM: boolean

    // handlers
    followUpsInteractionHandler?: FollowUpInteractionHandler
    quickActionHandler?: QuickActionHandler
    textMessageHandler?: TextMessageHandler
    messageController?: MessageController

    savedContextCommands: MynahUIDataModel['contextCommands']

    constructor({
        postMessage,
        mynahUI,
        enableAgents,
        featureConfigsSerialized,
        welcomeCount,
        disclaimerAcknowledged,
        regionProfile,
        disabledCommands,
        isSMUS,
        isSM,
    }: {
        postMessage: any
        mynahUI: MynahUI | undefined
        enableAgents: boolean
        featureConfigsSerialized: [string, FeatureContext][]
        welcomeCount: number
        disclaimerAcknowledged: boolean
        regionProfile?: RegionProfile
        disabledCommands?: string[]
        isSMUS?: boolean
        isSM?: boolean
    }) {
        this.postMessage = postMessage
        this.welcomeCount = welcomeCount
        this.disclaimerCardActive = !disclaimerAcknowledged
        this.isSMUS = isSMUS ?? false
        this.isSM = isSM ?? false

        this.responseMetadata = new Map<string, string[]>()

        window.addEventListener('error', (e) => {
            const { error, message } = e
            postMessage({
                type: 'error',
                event: this.connector?.isUIReady ? 'webview_error' : 'toolkit_didLoadModule',
                errorMessage: error ? error.toString() : message,
            })
        })

        this.tabsStorage = new TabsStorage({
            onTabTimeout: (tabID) => {
                this.mynahUI?.addChatItem(tabID, {
                    type: ChatItemType.ANSWER,
                    body: 'This conversation has timed out after 48 hours. It will not be saved. Start a new conversation.',
                })
                this.mynahUI?.updateStore(tabID, {
                    promptInputDisabledState: true,
                    promptInputPlaceholder: 'Session ended.',
                })
            },
        })

        this.isFeatureDevEnabled = enableAgents
        this.isGumbyEnabled = enableAgents
        this.isScanEnabled = enableAgents
        this.isTestEnabled = enableAgents
        this.isDocEnabled = enableAgents

        this.featureConfigs = tryNewMap(featureConfigsSerialized)
        const highlightCommand = this.featureConfigs.get('highlightCommand')

        this.tabDataGenerator = new TabDataGenerator({
            isFeatureDevEnabled: enableAgents,
            isGumbyEnabled: enableAgents,
            isScanEnabled: enableAgents,
            isTestEnabled: enableAgents,
            isDocEnabled: enableAgents,
            disabledCommands,
            commandHighlight: highlightCommand,
            regionProfile, // TODO
        })

        this.connector = new Connector({
            tabsStorage: this.tabsStorage,
            /**
             * Proxy for allowing underlying common connectors to call quick action handlers
             */
            handleCommand: (chatPrompt: ChatPrompt, tabId: string) => {
                this.quickActionHandler?.handle(chatPrompt, tabId)
            },
            onUpdateAuthentication: (isAmazonQEnabled: boolean, authenticatingTabIDs: string[]): void => {
                this.isFeatureDevEnabled = isAmazonQEnabled
                this.isGumbyEnabled = isAmazonQEnabled
                this.isScanEnabled = isAmazonQEnabled
                this.isTestEnabled = isAmazonQEnabled
                this.isDocEnabled = isAmazonQEnabled

                this.quickActionHandler = new QuickActionHandler({
                    mynahUI: this.mynahUI!,
                    connector: this.connector!,
                    tabsStorage: this.tabsStorage,
                    isFeatureDevEnabled: this.isFeatureDevEnabled,
                    isGumbyEnabled: this.isGumbyEnabled,
                    isScanEnabled: this.isScanEnabled,
                    isTestEnabled: this.isTestEnabled,
                    isDocEnabled: this.isDocEnabled,
                    disabledCommands,
                })

                this.tabDataGenerator = new TabDataGenerator({
                    isFeatureDevEnabled: this.isFeatureDevEnabled,
                    isGumbyEnabled: this.isGumbyEnabled,
                    isScanEnabled: this.isScanEnabled,
                    isTestEnabled: this.isTestEnabled,
                    isDocEnabled: this.isDocEnabled,
                    disabledCommands,
                    commandHighlight: highlightCommand,
                    regionProfile, // TODO
                })

                this.featureConfigs = tryNewMap(featureConfigsSerialized)

                // Set the new defaults for the quick action commands in all tabs now that isFeatureDevEnabled was enabled/disabled
                for (const tab of this.tabsStorage.getTabs()) {
                    this.mynahUI?.updateStore(tab.id, {
                        quickActionCommands: this.tabDataGenerator.quickActionsGenerator.generateForTab(tab.type),
                    })
                }

                // Unlock every authenticated tab that is now authenticated
                if (isAmazonQEnabled) {
                    for (const tabID of authenticatingTabIDs) {
                        this.mynahUI?.addChatItem(tabID, {
                            type: ChatItemType.ANSWER,
                            body: 'Authentication successful. Connected to Amazon Q.',
                        })

                        if (
                            this.tabsStorage.getTab(tabID)?.type === 'gumby' ||
                            this.tabsStorage.getTab(tabID)?.type === 'review' ||
                            this.tabsStorage.getTab(tabID)?.type === 'testgen'
                        ) {
                            this.mynahUI?.updateStore(tabID, {
                                promptInputDisabledState: false,
                            })
                        }
                    }
                }
            },
            onOpenDetailedList: (data: DetailedListSheetProps) => {
                return this.mynahUI!.openDetailedList(data)
            },
            onSelectTab: (tabID: string, eventID: string) => {
                this.mynahUI?.selectTab(tabID, eventID || '')
            },
            onExportChat: (tabID: string, format: 'markdown' | 'html'): string => {
                if (tabID) {
                    return this.mynahUI!.serializeChat(tabID, format)
                }
                return ''
            },
            onFileActionClick: (tabID: string, messageId: string, filePath: string, actionName: string): void => {},
            onQuickHandlerCommand: (tabID: string, command?: string, eventId?: string) => {
                this.tabsStorage.updateTabLastCommand(tabID, command)
                if (command === 'aws.awsq.transform') {
                    this.quickActionHandler?.handle({ command: '/transform' }, tabID, eventId)
                } else if (command === 'aws.awsq.clearchat') {
                    this.quickActionHandler?.handle({ command: '/clear' }, tabID)
                }
            },
            onCWCContextCommandMessage: (message: ChatItem, command?: string): string | undefined => {
                const selectedTab = this.tabsStorage.getSelectedTab()
                this.tabsStorage.updateTabLastCommand(selectedTab?.id || '', command || '')

                if (command === 'aws.amazonq.sendToPrompt') {
                    return this.messageController?.sendSelectedCodeToTab(message, command)
                } else {
                    const tabID = this.messageController?.sendMessageToTab(message, 'cwc', command)
                    if (tabID && command) {
                        this.postMessage(createOpenAgentTelemetry('cwc', 'right-click'))
                        this.postMessage({
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
                this.followUpsInteractionHandler?.onWelcomeFollowUpClicked(tabID, welcomeFollowUpType)
            },
            onChatInputEnabled: (tabID: string, enabled: boolean) => {
                this.mynahUI?.updateStore(tabID, {
                    promptInputDisabledState: this.tabsStorage.isTabDead(tabID) || !enabled,
                })
            },
            onUpdatePromptProgress: (tabID: string, progressField: ProgressField) => {
                this.mynahUI?.updateStore(tabID, {
                    promptInputProgress: progressField,
                })
            },
            onAsyncEventProgress: (
                tabID: string,
                inProgress: boolean,
                message: string | undefined,
                messageId: string | undefined = undefined,
                enableStopAction: boolean = false
            ) => {
                if (inProgress) {
                    this.mynahUI?.updateStore(tabID, {
                        loadingChat: true,
                        promptInputDisabledState: true,
                        cancelButtonWhenLoading: enableStopAction,
                    })

                    if (message && messageId) {
                        this.mynahUI?.updateChatAnswerWithMessageId(tabID, messageId, {
                            body: message,
                        })
                    } else if (message) {
                        this.mynahUI?.updateLastChatAnswer(tabID, {
                            body: message,
                        })
                    } else {
                        this.mynahUI?.addChatItem(tabID, {
                            type: ChatItemType.ANSWER_STREAM,
                            body: '',
                            messageId: messageId,
                        })
                    }
                    this.tabsStorage.updateTabStatus(tabID, 'busy')
                    return
                }

                this.mynahUI?.updateStore(tabID, {
                    loadingChat: false,
                    promptInputDisabledState: this.tabsStorage.isTabDead(tabID),
                })
                this.tabsStorage.updateTabStatus(tabID, 'free')
            },
            sendMessageToExtension: (message) => {
                this.postMessage(message)
            },
            onChatAnswerUpdated: (tabID: string, item: ChatItem) => {
                if (item.messageId !== undefined) {
                    this.mynahUI?.updateChatAnswerWithMessageId(tabID, item.messageId, {
                        ...(item.body !== undefined ? { body: item.body } : {}),
                        ...(item.buttons !== undefined ? { buttons: item.buttons } : {}),
                        ...(item.followUp !== undefined ? { followUp: item.followUp } : {}),
                        ...(item.footer !== undefined ? { footer: item.footer } : {}),
                        ...(item.canBeVoted !== undefined ? { canBeVoted: item.canBeVoted } : {}),
                    })
                } else {
                    this.mynahUI?.updateLastChatAnswer(tabID, {
                        ...(item.body !== undefined ? { body: item.body } : {}),
                        ...(item.buttons !== undefined ? { buttons: item.buttons } : {}),
                        ...(item.followUp !== undefined ? { followUp: item.followUp } : {}),
                        ...(item.footer !== undefined ? { footer: item.footer } : {}),
                        ...(item.canBeVoted !== undefined ? { canBeVoted: item.canBeVoted } : {}),
                    })
                }
            },
            onChatAnswerReceived: (tabID: string, item: CWCChatItem, messageData: any) => {
                if (item.type === ChatItemType.ANSWER_PART || item.type === ChatItemType.CODE_RESULT) {
                    this.mynahUI?.updateLastChatAnswer(tabID, {
                        ...(item.messageId !== undefined ? { messageId: item.messageId } : {}),
                        ...(item.canBeVoted !== undefined ? { canBeVoted: item.canBeVoted } : {}),
                        ...(item.codeReference !== undefined ? { codeReference: item.codeReference } : {}),
                        ...(item.body !== undefined ? { body: item.body } : {}),
                        ...(item.relatedContent !== undefined ? { relatedContent: item.relatedContent } : {}),
                        ...(item.followUp !== undefined ? { followUp: item.followUp } : {}),
                        ...(item.fileList !== undefined ? { fileList: item.fileList } : {}),
                        ...(item.header !== undefined ? { header: item.header } : { header: undefined }),
                    })
                    if (
                        item.messageId !== undefined &&
                        item.userIntent !== undefined &&
                        item.codeBlockLanguage !== undefined
                    ) {
                        this.responseMetadata.set(item.messageId, [item.userIntent, item.codeBlockLanguage])
                    }
                    this.postMessage({
                        command: 'update-chat-message-telemetry',
                        tabID,
                        tabType: this.tabsStorage.getTab(tabID)?.type,
                        time: Date.now(),
                    })
                    return
                }

                if (item.contextList !== undefined && item.contextList.length > 0) {
                    item.header = {
                        fileList: {
                            fileTreeTitle: '',
                            filePaths: item.contextList.map((file) => file.relativeFilePath),
                            rootFolderTitle: 'Context',
                            flatList: true,
                            collapsed: true,
                            hideFileCount: true,
                            details: Object.fromEntries(
                                item.contextList.map((file) => [
                                    file.relativeFilePath,
                                    {
                                        label: file.lineRanges
                                            .map((range) =>
                                                range.first === -1 || range.second === -1
                                                    ? ''
                                                    : `line ${range.first} - ${range.second}`
                                            )
                                            .join(', '),
                                        description: file.relativeFilePath,
                                        clickable: true,
                                    },
                                ])
                            ),
                        },
                    }
                }

                if (
                    item.body !== undefined ||
                    item.relatedContent !== undefined ||
                    item.followUp !== undefined ||
                    item.formItems !== undefined ||
                    item.buttons !== undefined
                ) {
                    this.mynahUI?.addChatItem(tabID, {
                        ...item,
                        messageId: item.messageId,
                        codeBlockActions: this.getCodeBlockActions(messageData),
                    })
                }

                if (
                    item.type === ChatItemType.PROMPT ||
                    item.type === ChatItemType.SYSTEM_PROMPT ||
                    item.type === ChatItemType.AI_PROMPT
                ) {
                    this.mynahUI?.updateStore(tabID, {
                        loadingChat: true,
                        cancelButtonWhenLoading: false,
                        promptInputDisabledState: true,
                    })

                    this.tabsStorage.updateTabStatus(tabID, 'busy')
                    return
                }

                if (item.type === ChatItemType.ANSWER) {
                    this.mynahUI?.updateStore(tabID, {
                        loadingChat: false,
                        promptInputDisabledState: this.tabsStorage.isTabDead(tabID),
                    })
                    this.tabsStorage.updateTabStatus(tabID, 'free')

                    /**
                     * We've received an answer for a tabID and this message has
                     * completed its round trip. Send that information back to
                     * VSCode so we can emit a round trip event
                     **/
                    this.postMessage({
                        command: 'stop-chat-message-telemetry',
                        tabID,
                        tabType: this.tabsStorage.getTab(tabID)?.type,
                        time: Date.now(),
                    })
                }
            },
            onRunTestMessageReceived: (tabID: string, shouldRunTestMessage: boolean) => {
                if (shouldRunTestMessage) {
                    this.quickActionHandler?.handle({ command: '/test' }, tabID)
                }
            },
            onMessageReceived: (tabID: string, messageData: MynahUIDataModel) => {
                this.mynahUI?.updateStore(tabID, messageData)
            },
            onFileComponentUpdate: (
                tabID: string,
                filePaths: DiffTreeFileInfo[],
                deletedFiles: DiffTreeFileInfo[],
                messageId: string,
                disableFileActions: boolean
            ) => {
                const updateWith: Partial<ChatItem> = {
                    type: ChatItemType.ANSWER,
                    fileList: {
                        rootFolderTitle: 'Changes',
                        filePaths: filePaths.map((i) => i.zipFilePath),
                        deletedFiles: deletedFiles.map((i) => i.zipFilePath),
                        details: getDetails([...filePaths, ...deletedFiles]),
                        actions: disableFileActions ? undefined : getActions([...filePaths, ...deletedFiles]),
                    },
                }
                this.mynahUI?.updateChatAnswerWithMessageId(tabID, messageId, updateWith)
            },
            onWarning: (tabID: string, message: string, title: string) => {
                this.mynahUI?.notify({
                    title: title,
                    content: message,
                    type: NotificationType.WARNING,
                })
                this.mynahUI?.updateStore(tabID, {
                    loadingChat: false,
                    promptInputDisabledState: this.tabsStorage.isTabDead(tabID),
                })
                this.tabsStorage.updateTabStatus(tabID, 'free')
            },
            onError: (tabID: string, message: string, title: string) => {
                const answer: ChatItem = {
                    type: ChatItemType.ANSWER,
                    body: `**${title}**
     ${message}`,
                }

                if (tabID !== '') {
                    this.mynahUI?.updateStore(tabID, {
                        loadingChat: false,
                        promptInputDisabledState: this.tabsStorage.isTabDead(tabID),
                    })
                    this.tabsStorage.updateTabStatus(tabID, 'free')

                    this.mynahUI?.addChatItem(tabID, answer)
                } else {
                    const newTabId = this.mynahUI?.updateStore('', {
                        tabTitle: 'Error',
                        quickActionCommands: [],
                        promptInputPlaceholder: '',
                        chatItems: [answer],
                    })
                    if (newTabId === undefined) {
                        this.mynahUI?.notify({
                            content: uiComponentsTexts.noMoreTabsTooltip,
                            type: NotificationType.WARNING,
                        })
                        return
                    } else {
                        // TODO remove this since it will be added with the onTabAdd and onTabAdd is now sync,
                        // It means that it cannot trigger after the updateStore function returns.
                        this.tabsStorage.addTab({
                            id: newTabId,
                            status: 'busy',
                            type: 'cwc',
                            isSelected: true,
                        })
                    }
                }
                return
            },
            onUpdatePlaceholder: (tabID: string, newPlaceholder: string) => {
                this.mynahUI?.updateStore(tabID, {
                    promptInputPlaceholder: newPlaceholder,
                })
            },
            onNewTab: (tabType: TabType, chats?: ChatItem[]) => {
                const newTabID = this.mynahUI?.updateStore('', {})
                if (!newTabID) {
                    return
                }
                this.tabsStorage.updateTabTypeFromUnknown(newTabID, tabType)
                this.connector?.onKnownTabOpen(newTabID)
                this.connector?.onUpdateTabType(newTabID)

                this.mynahUI?.updateStore(newTabID, {
                    ...this.tabDataGenerator?.getTabData(tabType, true),
                    ...(chats ? { chatItems: chats } : {}),
                })
                this.featureConfigs = tryNewMap(featureConfigsSerialized)
                return newTabID
            },
            onOpenSettingsMessage: (tabId: string) => {
                this.mynahUI?.addChatItem(tabId, {
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
                this.tabsStorage.updateTabStatus(tabId, 'free')
                this.mynahUI?.updateStore(tabId, {
                    loadingChat: false,
                    promptInputDisabledState: this.tabsStorage.isTabDead(tabId),
                })
                return
            },
            /**
             * Helps with sending static messages that don't need to be sent through to the
             * VSCode side. E.g. help messages
             */
            sendStaticMessages: (tabID: string, messages: ChatItem[]) => {
                if (this.tabsStorage.getTab(tabID)?.type === 'welcome') {
                    // set the tab type to cwc since its the most general one
                    this.tabsStorage.updateTabTypeFromUnknown(tabID, 'cwc')

                    // collapse the ui before adding the message
                    this.mynahUI?.updateStore(tabID, {
                        tabHeaderDetails: void 0,
                        compactMode: false,
                        tabBackground: false,
                        promptInputText: '',
                        promptInputLabel: void 0,
                        chatItems: [],
                        tabTitle: 'Chat',
                    })
                }

                for (const message of messages) {
                    this.mynahUI?.addChatItem(tabID, message)
                }
            },
            onContextCommandDataReceived: (data: MynahUIDataModel['contextCommands']) => {
                this.savedContextCommands = data
                for (const tabID in this.mynahUI?.getAllTabs()) {
                    const tabType = this.tabsStorage.getTab(tabID)?.type || ''
                    if (['cwc', 'unknown', 'welcome'].includes(tabType)) {
                        this.mynahUI.updateStore(tabID, {
                            contextCommands: this.savedContextCommands,
                        })
                    }
                }
            },
            onShowCustomForm: (
                tabId: string,
                formItems?: ChatItemFormItem[],
                buttons?: ChatItemButton[],
                title?: string,
                description?: string
            ) => {
                this.mynahUI?.showCustomForm(tabId, formItems, buttons, title, description)
            },
        })

        this.mynahUI = new MynahUI({
            onReady: this.connector.uiReady,
            onTabAdd: (tabID: string) => {
                /**
                 * If the next tab opening will cross the welcome count threshold then
                 * update the next tabs defaults
                 */
                if (welcomeCount + 1 >= welcomeCountThreshold) {
                    this.tabsStorage.updateTabTypeFromUnknown(tabID, 'cwc')
                    mynahUI?.updateTabDefaults({
                        store: {
                            ...this.tabDataGenerator?.getTabData('cwc', true, undefined, this.isSMUS),
                            tabHeaderDetails: void 0,
                            compactMode: false,
                            tabBackground: false,
                        },
                    })
                } else {
                    // we haven't reached the welcome count limit yet
                    this.updateWelcomeCount()
                }

                // If featureDev has changed availability inbetween the default store settings and now
                // make sure to show/hide it accordingly
                this.mynahUI?.updateStore(tabID, {
                    quickActionCommands: this.tabDataGenerator?.quickActionsGenerator.generateForTab('unknown'),
                    ...(this.disclaimerCardActive ? { promptInputStickyCard: disclaimerCard } : {}),
                })
                // add the cached context commands for file, folder, etc selection
                if (this.savedContextCommands && this.savedContextCommands.length > 0) {
                    this.mynahUI?.updateStore(tabID, {
                        contextCommands: this.savedContextCommands,
                    })
                }
                this.connector?.onTabAdd(tabID)
            },
            onTabRemove: this.connector.onTabRemove,
            onTabChange: this.connector.onTabChange,
            // TODO: update mynah-ui this type doesn't seem correct https://github.com/aws/mynah-ui/blob/3777a39eb534a91fd6b99d6cf421ce78ee5c7526/src/main.ts#L372
            onStopChatResponse: (tabID: string) => {
                this.mynahUI?.updateStore(tabID, {
                    loadingChat: false,
                    promptInputDisabledState: false,
                })
                this.connector?.onStopChatResponse(tabID)
            },
            onChatPrompt: (tabID: string, prompt: ChatPrompt, eventId: string | undefined) => {
                if ((prompt.prompt ?? '') === '' && (prompt.command ?? '') === '') {
                    return
                }

                const tabType = this.tabsStorage.getTab(tabID)?.type
                if (tabType === 'featuredev') {
                    this.mynahUI?.addChatItem(tabID, {
                        type: ChatItemType.ANSWER_STREAM,
                    })
                } else if (tabType === 'gumby') {
                    this.connector?.requestAnswer(tabID, {
                        chatMessage: prompt.prompt ?? '',
                    })
                    return
                }

                if (tabType === 'welcome') {
                    this.mynahUI?.updateStore(tabID, {
                        tabHeaderDetails: void 0,
                        compactMode: false,
                        tabBackground: false,
                        promptInputText: '',
                        promptInputLabel: void 0,
                        chatItems: [],
                    })
                }

                // handler for the "/" agent commands
                if (prompt.command !== undefined && prompt.command.trim() !== '') {
                    this.quickActionHandler?.handle(prompt, tabID, eventId)

                    const newTabType = this.tabsStorage.getSelectedTab()?.type
                    if (newTabType) {
                        this.postMessage(createOpenAgentTelemetry(newTabType, 'quick-action'))
                    }
                    return
                }

                /**
                 * Update the tab title if coming from the welcome page
                 * non cwc panels will have this updated automatically
                 */
                if (tabType === 'welcome') {
                    this.mynahUI?.updateStore(tabID, {
                        tabTitle: this.tabDataGenerator?.getTabData('cwc', false).tabTitle,
                    })
                }

                // handler for the cwc panel
                this.textMessageHandler?.handle(prompt, tabID, eventId as string)
            },
            onQuickCommandGroupActionClick: this.connector.onQuickCommandGroupActionClick,
            onContextSelected: this.connector.onContextSelected,
            onTabBarButtonClick: this.connector.onTabBarButtonClick,
            onVote: this.connector.onChatItemVoted,
            onInBodyButtonClicked: (tabId, messageId, action, eventId) => {
                switch (action.id) {
                    case disclaimerAcknowledgeButtonId: {
                        this.disclaimerCardActive = false

                        // post message to tell VSCode that disclaimer is acknowledged
                        this.postMessage({
                            command: 'disclaimer-acknowledged',
                        })

                        // create telemetry
                        this.postMessage(createClickTelemetry('amazonq-disclaimer-acknowledge-button'))

                        // remove all disclaimer cards from all tabs
                        for (const storeTabKey of Object.keys(this.mynahUI?.getAllTabs() ?? [])) {
                            // eslint-disable-next-line unicorn/no-null
                            this.mynahUI?.updateStore(storeTabKey, { promptInputStickyCard: null })
                        }
                        return
                    }
                    case 'quick-start': {
                        /**
                         * quick start is the action on the welcome page. When its
                         * clicked it collapses the view and puts it into regular
                         * "chat" which is cwc
                         */
                        this.tabsStorage.updateTabTypeFromUnknown(tabId, 'cwc')

                        // show quick start in the current tab instead of a new one
                        this.mynahUI?.updateStore(tabId, {
                            tabHeaderDetails: undefined,
                            compactMode: false,
                            tabBackground: false,
                            promptInputText: '/',
                            promptInputLabel: undefined,
                            chatItems: [],
                        })

                        this.postMessage(createClickTelemetry('amazonq-welcome-quick-start-button'))
                        return
                    }
                    case 'explore': {
                        const newTabId = this.mynahUI?.updateStore('', agentWalkthroughDataModel)
                        if (newTabId === undefined) {
                            this.mynahUI?.notify({
                                content: uiComponentsTexts.noMoreTabsTooltip,
                                type: NotificationType.WARNING,
                            })
                            return
                        }
                        this.tabsStorage.updateTabTypeFromUnknown(newTabId, 'agentWalkthrough')
                        this.postMessage(createClickTelemetry('amazonq-welcome-explore-button'))
                        return
                    }
                    default: {
                        this.connector?.onCustomFormAction(tabId, messageId, action, eventId)
                        return
                    }
                }
            },
            onCustomFormAction: (tabId, action, eventId) => {
                this.connector?.onCustomFormAction(tabId, undefined, action, eventId)
            },
            onFormTextualItemKeyPress: (
                event: KeyboardEvent,
                formData: Record<string, string>,
                itemId: string,
                tabId: string,
                eventId?: string
            ) => {
                return this.connector!.onFormTextualItemKeyPress(event, formData, itemId, tabId, eventId)
            },
            onChatPromptProgressActionButtonClicked: (tabID, action) => {
                this.connector?.onCustomFormAction(tabID, undefined, action)
            },
            onSendFeedback: (tabId, feedbackPayload) => {
                this.connector?.sendFeedback(tabId, feedbackPayload)
                this.mynahUI?.notify({
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
                this.connector?.onCodeInsertToCursorPosition(
                    tabId,
                    messageId,
                    code,
                    type,
                    referenceTrackerInfo,
                    eventId,
                    codeBlockIndex,
                    totalCodeBlocks,
                    this.responseMetadata.get(messageId)?.[0] ?? undefined,
                    this.responseMetadata.get(messageId)?.[1] ?? undefined
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
                        this.connector?.onAcceptDiff(
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
                        this.connector?.onViewDiff(
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
                this.connector?.onCopyCodeToClipboard(
                    tabId,
                    messageId,
                    code,
                    type,
                    referenceTrackerInfo,
                    eventId,
                    codeBlockIndex,
                    totalCodeBlocks,
                    this.responseMetadata.get(messageId)?.[0] ?? undefined,
                    this.responseMetadata.get(messageId)?.[1] ?? undefined
                )
                this.mynahUI?.notify({
                    type: NotificationType.SUCCESS,
                    content: 'Selected code is copied to clipboard',
                })
            },
            onChatItemEngagement: this.connector.triggerSuggestionEngagement,
            onSourceLinkClick: (tabId, messageId, link, mouseEvent) => {
                mouseEvent?.preventDefault()
                mouseEvent?.stopPropagation()
                mouseEvent?.stopImmediatePropagation()
                this.connector?.onSourceLinkClick(tabId, messageId, link)
            },
            onLinkClick: (tabId, messageId, link, mouseEvent) => {
                mouseEvent?.preventDefault()
                mouseEvent?.stopPropagation()
                mouseEvent?.stopImmediatePropagation()
                this.connector?.onResponseBodyLinkClick(tabId, messageId, link)
            },
            onFormLinkClick: (link, mouseEvent) => {
                mouseEvent?.preventDefault()
                mouseEvent?.stopPropagation()
                mouseEvent?.stopImmediatePropagation()
                this.connector?.onLinkClick(link)
            },
            onInfoLinkClick: (tabId: string, link: string, mouseEvent?: MouseEvent) => {
                mouseEvent?.preventDefault()
                mouseEvent?.stopPropagation()
                mouseEvent?.stopImmediatePropagation()
                this.connector?.onInfoLinkClick(tabId, link)
            },
            onResetStore: () => {},
            onFollowUpClicked: (tabID, messageId, followUp) => {
                this.followUpsInteractionHandler?.onFollowUpClicked(tabID, messageId, followUp)
            },
            onFileActionClick: async (tabID: string, messageId: string, filePath: string, actionName: string) => {
                this.connector?.onFileActionClick(tabID, messageId, filePath, actionName)
            },
            onFileClick: this.connector.onFileClick,
            tabs: {
                'tab-1': {
                    isSelected: true,
                    store: {
                        ...(this.showWelcomePage()
                            ? welcomeScreenTabData(this.tabDataGenerator).store
                            : this.tabDataGenerator.getTabData('cwc', true, undefined, isSMUS)),
                        ...(this.disclaimerCardActive ? { promptInputStickyCard: disclaimerCard } : {}),
                    },
                },
            },
            defaults: {
                store: this.showWelcomePage()
                    ? welcomeScreenTabData(this.tabDataGenerator).store
                    : this.tabDataGenerator.getTabData('cwc', true, undefined, isSMUS),
            },
            config: {
                maxTabs: 10,
                feedbackOptions: feedbackOptions,
                texts: uiComponentsTexts,
                tabBarButtons: [
                    {
                        id: 'history_sheet',
                        icon: MynahIcons.HISTORY,
                        description: 'View chat history',
                    },
                    {
                        id: 'export_chat',
                        icon: MynahIcons.EXTERNAL,
                        description: 'Export chat',
                    },
                ],
            },
        })

        /**
         * Update the welcome count if we've initially shown
         * the welcome page
         */
        if (this.showWelcomePage()) {
            this.updateWelcomeCount()
        }

        this.followUpsInteractionHandler = new FollowUpInteractionHandler({
            mynahUI: this.mynahUI,
            connector: this.connector,
            tabsStorage: this.tabsStorage,
        })
        this.quickActionHandler = new QuickActionHandler({
            mynahUI: this.mynahUI,
            connector: this.connector,
            tabsStorage: this.tabsStorage,
            isFeatureDevEnabled: this.isFeatureDevEnabled,
            isGumbyEnabled: this.isGumbyEnabled,
            isScanEnabled: this.isScanEnabled,
            isTestEnabled: this.isTestEnabled,
            isDocEnabled: this.isDocEnabled,
        })
        this.textMessageHandler = new TextMessageHandler({
            mynahUI: this.mynahUI,
            connector: this.connector,
            tabsStorage: this.tabsStorage,
        })
        this.messageController = new MessageController({
            mynahUI: this.mynahUI,
            connector: this.connector,
            tabsStorage: this.tabsStorage,
            isFeatureDevEnabled: this.isFeatureDevEnabled,
            isGumbyEnabled: this.isGumbyEnabled,
            isScanEnabled: this.isScanEnabled,
            isTestEnabled: this.isTestEnabled,
            isDocEnabled: this.isDocEnabled,
        })
    }

    private showWelcomePage = () => {
        /*
         * skip Agent Capability welcome page for SageMaker cases (SMAI and SMUS) since the commands are not supported
         */
        return this.welcomeCount < welcomeCountThreshold && !this.isSM
    }

    private updateWelcomeCount() {
        this.postMessage({
            command: 'update-welcome-count',
        })
        this.welcomeCount += 1
    }

    private getCodeBlockActions(messageData: any) {
        // Show ViewDiff and AcceptDiff for allowedCommands in CWC
        const isEnabled = this.featureConfigs?.get('ViewDiffInChat')?.variation === 'TREATMENT'
        const tab = this.tabsStorage.getTab(messageData?.tabID || '')
        const allowedCommands = [
            'aws.amazonq.refactorCode',
            'aws.amazonq.fixCode',
            'aws.amazonq.optimizeCode',
            'aws.amazonq.sendToPrompt',
        ]
        if (isEnabled && tab?.type === 'cwc' && allowedCommands.includes(tab.lastCommand || '')) {
            return {
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
        }
        // Show only "Copy" option for codeblocks in Q Test Tab
        if (tab?.type === 'testgen') {
            return {
                'insert-to-cursor': undefined,
            }
        }
        // Default will show "Copy" and "Insert at cursor" for codeblocks
        return {}
    }

    set mynahUI(mynahUI: MynahUI | undefined) {
        this._mynahUI = mynahUI

        this.followUpsInteractionHandler = new FollowUpInteractionHandler({
            mynahUI: this.mynahUI!,
            connector: this.connector!,
            tabsStorage: this.tabsStorage,
        })

        this.quickActionHandler = new QuickActionHandler({
            mynahUI: this.mynahUI!,
            connector: this.connector!,
            tabsStorage: this.tabsStorage,
            isFeatureDevEnabled: this.isFeatureDevEnabled,
            isGumbyEnabled: this.isGumbyEnabled,
            isScanEnabled: this.isScanEnabled,
            isTestEnabled: this.isTestEnabled,
            isDocEnabled: this.isDocEnabled,
        })

        this.textMessageHandler = new TextMessageHandler({
            mynahUI: this.mynahUI!,
            connector: this.connector!,
            tabsStorage: this.tabsStorage,
        })

        this.messageController = new MessageController({
            mynahUI: this.mynahUI!,
            connector: this.connector!,
            tabsStorage: this.tabsStorage,
            isFeatureDevEnabled: this.isFeatureDevEnabled,
            isGumbyEnabled: this.isGumbyEnabled,
            isScanEnabled: this.isScanEnabled,
            isTestEnabled: this.isTestEnabled,
            isDocEnabled: this.isDocEnabled,
        })
    }

    get mynahUI(): MynahUI | undefined {
        return this._mynahUI
    }
}
