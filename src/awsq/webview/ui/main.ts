/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Connector } from './connector'
import { ChatItem, ChatItemType, MynahUI, MynahUIDataModel, NotificationType } from '@aws/mynah-ui-chat'
import './styles/dark.scss'
import { ChatPrompt } from '@aws/mynah-ui-chat/dist/static'
import { TabType, TabTypeStorage } from './storages/tabTypeStorage'

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

const WelcomeFollowupType = {
    chat: 'continue-to-chat',
    assign: 'assign-code-task',
}
const WelcomeFollowUps = {
    text: 'Or you can select one of these',
    options: [
        {
            pillText: 'I want to assign a code task',
            type: WelcomeFollowupType.assign,
        },
        {
            pillText: 'I have a software development question',
            type: WelcomeFollowupType.chat,
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
    const tabTypeStorage = new TabTypeStorage()
    // Adding the first tab as CWC tab
    tabTypeStorage.addTab('tab-1', TabType.CodeWhispererChat)
    const connector = new Connector({
        tabTypeStorage,
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
                return
            }

            if (item.type === ChatItemType.ANSWER) {
                mynahUI.updateStore(tabID, {
                    loadingChat: false,
                    promptInputDisabledState: false,
                })
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
            return
        },
    })

    mynahUI = new MynahUI({
        onReady: connector.uiReady,
        onTabAdd: connector.onTabAdd,
        onTabRemove: connector.onTabRemove,
        onChatPrompt: (tabID: string, prompt: ChatPrompt) => {
            if (prompt.prompt === undefined) {
                return
            }
            if (prompt.prompt.match(/\/assign/)) {
                let affectedTabId = tabID
                const realPromptText = prompt.prompt?.replace('/assign', '').trim()

                if (tabTypeStorage.getTabType(affectedTabId) !== TabType.Unknown) {
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
                tabTypeStorage.updateTab(affectedTabId, TabType.WeaverBird)

                mynahUI.updateStore(affectedTabId, {
                    tabTitle: 'Q- Task',
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

            if (tabTypeStorage.getTabType(tabID) === TabType.Unknown) {
                tabTypeStorage.updateTab(tabID, TabType.CodeWhispererChat)
            }

            mynahUI.updateStore(tabID, {
                loadingChat: true,
                promptInputDisabledState: true,
            })

            const chatPayload = {
                chatMessage: prompt.prompt ?? '',
            }

            connector.requestGenerativeAIAnswer(tabID, chatPayload).then(i => {})
        },
        // onSendFeedback: undefined, //connector.sendFeedback,
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
            if (followUp.type === WelcomeFollowupType.assign) {
                const newTabId = mynahUI.updateStore('', {
                    tabTitle: 'Q- Task',
                    quickActionCommands: [],
                    promptInputPlaceholder: 'Assign a code task',
                    chatItems: [
                        {
                            type: ChatItemType.ANSWER,
                            body: WeaverBirdWelcomeMessage,
                        },
                    ],
                })
                tabTypeStorage.updateTab(newTabId, TabType.WeaverBird)
                tabTypeStorage.updateTab(tabID, TabType.CodeWhispererChat)
            } else if (followUp.type === WelcomeFollowupType.chat) {
                mynahUI.updateStore(tabID, {
                    chatItems: [
                        {
                            type: ChatItemType.ANSWER,
                            body: 'Ok, please write your question below.',
                        },
                    ],
                })
                tabTypeStorage.updateTab(tabID, TabType.CodeWhispererChat)
            } else {
                connector.followUpClicked(tabID, followUp)
            }
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
