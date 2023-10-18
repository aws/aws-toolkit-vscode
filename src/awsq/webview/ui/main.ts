/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Connector } from './connector'
import { ChatItem, ChatItemType, MynahUI, MynahUIDataModel, NotificationType } from '@aws/mynah-ui-chat'
import './styles/dark.scss'
import { ChatPrompt } from '@aws/mynah-ui-chat/dist/static'
import { TabsStorage } from './storages/tabsStorage'
import { WelcomeFollowupType } from './apps/awsqCommonsConnector'

const WelcomeMessage = `<span markdown="1">
Hi, I am AWS Q. I can answer your software development questions. 
Ask me to explain, debug, or optimize your code. 
You can enter \`/\` to see a list of quick actions.
</span>`
const WeaverBirdWelcomeMessage = `<span markdown="1">
### How \`/assign\` works:
1. Describe your job to be done
2. Agree on an approach
3. Q generate code
4. Review code suggestions, provide feedback if needed
</span>`

const WelcomeFollowUps = {
    text: 'Or you can select one of these',
    options: [
        {
            pillText: 'I want to assign a code task',
            type: 'assign-code-task',
        },
        {
            pillText: 'I have a software development question',
            type: 'continue-to-chat',
        },
    ],
}

const QuickActionCommands = [
    {
        groupName: 'Start a workflow',
        commands: [
            {
                command: '/assign',
                description: 'Give Q a coding task',
            },
        ],
    },
    {
        groupName: 'Quick Action',
        commands: [
            {
                command: '/explain',
                promptText: 'Explain',
                description: 'Explain selected code or an active file',
            },
            {
                command: '/fix',
                promptText: 'Fix',
                description: 'Debug selected code and suggest fix',
            },
            {
                command: '/refactor',
                promptText: 'Refactor',
                description: 'Refactor selected code',
            },
            {
                command: '/optimize',
                promptText: 'Optimize',
                description: 'Optimize selected code',
            },
        ],
    },
    {
        commands: [
            {
                command: '/clear',
                description: 'Clear this session',
            },
        ],
    },
]
export const createMynahUI = (initialData?: MynahUIDataModel) => {
    // eslint-disable-next-line prefer-const
    let mynahUI: MynahUI
    const ideApi = acquireVsCodeApi()
    const tabsStorage = new TabsStorage()
    // Adding the first tab as CWC tab
    tabsStorage.addTab({
        id: 'tab-1',
        status: 'free',
        type: 'unknown',
        isSelected: true,
    })
    const connector = new Connector({
        tabsStorage,
        onCWCContextCommandMessage: (message: ChatItem): string => {
            const selectedTab = tabsStorage.getSelectedTab()
            if (selectedTab !== undefined && selectedTab.type === 'cwc' && selectedTab.status === 'free') {
                mynahUI.updateStore(selectedTab.id, {
                    loadingChat: true,
                    promptInputDisabledState: true,
                })
                mynahUI.addChatAnswer(selectedTab.id, message)
                tabsStorage.updateTabStatus(selectedTab.id, 'busy')

                return selectedTab.id
            }

            const newTabID = mynahUI.updateStore('', {
                tabTitle: 'Chat',
                chatItems: [message],
                showChatAvatars: false,
                quickActionCommands: QuickActionCommands,
                promptInputPlaceholder: 'Ask a question or "/" for capabilities',
            })

            mynahUI.updateStore(newTabID, {
                loadingChat: true,
                promptInputDisabledState: true,
            })

            // We have race condition here with onTabAdd Ui event. This way we need to update store twice to be sure
            tabsStorage.addTab({
                id: newTabID,
                type: 'cwc',
                status: 'busy',
                isSelected: true,
            })

            tabsStorage.updateTabTypeFromUnknown(newTabID, 'cwc')
            tabsStorage.updateTabStatus(newTabID, 'busy')

            return newTabID
        },
        onWelcomeFollowUpClicked: (tabID: string, welcomeFollowUpType: WelcomeFollowupType) => {
            if (welcomeFollowUpType === 'assign-code-task') {
                const newTabId = mynahUI.updateStore('', {
                    tabTitle: 'Q - Task',
                    quickActionCommands: [],
                    promptInputPlaceholder: 'Assign a code task',
                    chatItems: [
                        {
                            type: ChatItemType.ANSWER,
                            body: WeaverBirdWelcomeMessage,
                        },
                    ],
                })
                // TODO remove this since it will be added with the onTabAdd and onTabAdd is now sync,
                // It means that it cannot trigger after the updateStore function returns.
                tabsStorage.addTab({
                    id: newTabId,
                    status: 'busy',
                    type: 'unknown',
                    isSelected: true,
                })

                tabsStorage.updateTabTypeFromUnknown(tabID, 'cwc')
                tabsStorage.updateTabTypeFromUnknown(newTabId, 'wb')
                return
            }

            if (welcomeFollowUpType === 'continue-to-chat') {
                mynahUI.updateStore(tabID, {
                    chatItems: [
                        {
                            type: ChatItemType.ANSWER,
                            body: 'Ok, please write your question below.',
                        },
                    ],
                })
                tabsStorage.updateTabTypeFromUnknown(tabID, 'cwc')
                return
            }
        },
        sendMessageToExtension: message => {
            ideApi.postMessage(message)
        },
        onChatAnswerReceived: (tabID: string, item: ChatItem) => {
            if (item.type === 'answer-part') {
                if (typeof item.body === 'string') {
                    mynahUI.updateLastChatAnswerStream(tabID, item.body)
                }
                if (item.relatedContent !== undefined) {
                    mynahUI.updateLastChatAnswerStream(tabID, {
                        title: item.relatedContent.title,
                        suggestions: item.relatedContent.content,
                    })
                }

                return
            }

            if (item.body !== undefined || item.relatedContent !== undefined || item.followUp !== undefined) {
                mynahUI.addChatAnswer(tabID, item)
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
                    promptInputDisabledState: false,
                })
                tabsStorage.updateTabStatus(tabID, 'free')
            }
        },
        onMessageReceived: (tabID: string, messageData: MynahUIDataModel) => {
            mynahUI.updateStore(tabID, messageData)
        },
        onWarning: (tabID: string, message: string, title: string) => {
            mynahUI.notify({
                title: title,
                content: message,
                type: NotificationType.WARNING,
            })
            mynahUI.updateStore(tabID, {
                loadingChat: false,
                promptInputDisabledState: false,
            })
            tabsStorage.updateTabStatus(tabID, 'free')
        },
        onError: (tabID: string, message: string, title: string) => {
            const answer: ChatItem = {
                type: ChatItemType.ANSWER,
                body: `<span markdown="1">**${title}**
                    ${message}
</span>`,
            }

            mynahUI.addChatAnswer(tabID, answer)
            mynahUI.updateStore(tabID, {
                loadingChat: false,
                promptInputDisabledState: false,
            })
            tabsStorage.updateTabStatus(tabID, 'free')
            return
        },
    })

    mynahUI = new MynahUI({
        onReady: connector.uiReady,
        onTabAdd: connector.onTabAdd,
        onTabRemove: connector.onTabRemove,
        onTabChange: connector.onTabChange,
        onChatPrompt: (tabID: string, prompt: ChatPrompt) => {
            if (prompt.prompt === undefined) {
                return
            }
            if (prompt.prompt.match(/\/assign/)) {
                let affectedTabId = tabID
                const realPromptText = prompt.prompt?.replace('/assign', '').trim()

                if (tabsStorage.getTab(affectedTabId)?.type !== 'unknown') {
                    affectedTabId = mynahUI.updateStore('', {
                        chatItems: [
                            ...(realPromptText !== ''
                                ? [
                                      {
                                          type: ChatItemType.PROMPT,
                                          body: realPromptText,
                                      },
                                  ]
                                : [
                                      {
                                          type: ChatItemType.ANSWER,
                                          body: WeaverBirdWelcomeMessage,
                                      },
                                  ]),
                        ],
                    })
                }
                tabsStorage.updateTabTypeFromUnknown(affectedTabId, 'wb')

                mynahUI.updateStore(affectedTabId, {
                    tabTitle: 'Q - Task',
                    quickActionCommands: [],
                    promptInputPlaceholder: 'Assign a code task',
                })

                if (realPromptText !== '') {
                    connector.requestGenerativeAIAnswer(affectedTabId, {
                        chatMessage: realPromptText,
                    })
                } else if (affectedTabId === tabID) {
                    mynahUI.addChatAnswer(affectedTabId, {
                        type: ChatItemType.ANSWER,
                        body: WeaverBirdWelcomeMessage,
                    })
                }

                return
            }

            tabsStorage.updateTabTypeFromUnknown(tabID, 'cwc')

            mynahUI.updateStore(tabID, {
                loadingChat: true,
                promptInputDisabledState: true,
            })

            tabsStorage.updateTabStatus(tabID, 'busy')
            const chatPayload = {
                chatMessage: prompt.prompt ?? '',
            }

            connector.requestGenerativeAIAnswer(tabID, chatPayload).then(i => {})
        },
        onSendFeedback: connector.sendFeedback,
        onCodeInsertToCursorPosition: connector.onCodeInsertToCursorPosition,
        onCopyCodeToClipboard: connector.onCopyCodeToClipboard,
        onSuggestionEngagement: connector.triggerSuggestionEngagement,
        onSuggestionInteraction: (eventName, suggestion, mouseEvent) => {
            // mouseEvent?.preventDefault();
            // mouseEvent?.stopPropagation();
            // mouseEvent?.stopImmediatePropagation();
            // connector.triggerSuggestionEvent(eventName, suggestion, mynahUI.getSearchPayload().selectedTab);
        },
        onResetStore: () => {},
        onFollowUpClicked: (tabID, followUp) => {
            if (followUp.prompt !== undefined) {
                mynahUI.updateStore(tabID, {
                    loadingChat: true,
                    promptInputDisabledState: true,
                })
                tabsStorage.updateTabStatus(tabID, 'busy')
            }
            connector.onFollowUpClicked(tabID, followUp)
        },
        onOpenDiff: connector.onOpenDiff,
        onStopChatResponse: (tabID: string) => {
            mynahUI.updateStore(tabID, {
                loadingChat: false,
            })
            connector.onStopChatResponse(tabID)
        },
        tabs: {
            'tab-1': {
                isSelected: true,
                store: {
                    tabTitle: 'Chat',
                    chatItems: [
                        {
                            type: ChatItemType.ANSWER,
                            body: WelcomeMessage,
                        },
                        {
                            type: ChatItemType.ANSWER,
                            followUp: WelcomeFollowUps,
                        },
                    ],
                    showChatAvatars: false,
                    quickActionCommands: QuickActionCommands,
                    promptInputPlaceholder: 'Ask a question or "/" for capabilities',
                    ...initialData,
                },
            },
        },
        defaults: {
            store: {
                tabTitle: 'Chat',
                chatItems: [
                    {
                        type: ChatItemType.ANSWER,
                        body: WelcomeMessage,
                    },
                    {
                        type: ChatItemType.ANSWER,
                        followUp: WelcomeFollowUps,
                    },
                ],
                showChatAvatars: false,
                quickActionCommands: QuickActionCommands,
                promptInputPlaceholder: 'Ask a question or "/" for capabilities',
            },
        },
    })
}
