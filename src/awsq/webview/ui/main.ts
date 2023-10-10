/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Connector } from './connector'
import { ChatItem, ChatItemType, MynahUI, MynahUIDataModel, NotificationType } from '@aws/mynah-ui-chat'
import './styles/dark.scss'
import './styles/frequent-apis.scss'
import { ChatPrompt } from '@aws/mynah-ui-chat/dist/static'

export const createMynahUI = (initialData?: MynahUIDataModel) => {
    // eslint-disable-next-line prefer-const
    let mynahUI: MynahUI
    const ideApi = acquireVsCodeApi()
    const connector = new Connector({
        postMessageHandler: message => {
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
            mynahUI.updateStore(tabID, {
                loadingChat: true,
                promptInputDisabledState: true,
            })
            setTimeout(() => {
                const chatPayload = {
                    chatMessage: prompt.prompt ?? '',
                    ...(prompt.attachment !== undefined && prompt.attachment.type == 'ApiDocsSuggestion'
                        ? { attachedAPIDocsSuggestion: prompt.attachment }
                        : {}),
                    ...(prompt.attachment !== undefined && prompt.attachment.type !== 'ApiDocsSuggestion'
                        ? { attachedVanillaSuggestion: prompt.attachment }
                        : {}),
                }

                connector.requestGenerativeAIAnswer(tabID, chatPayload).then(i => {})
            }, 2000)
        },
        onSendFeedback: undefined, //connector.sendFeedback,
        onSuggestionEngagement: connector.triggerSuggestionEngagement,
        onSuggestionInteraction: (eventName, suggestion, mouseEvent) => {
            // mouseEvent?.preventDefault();
            // mouseEvent?.stopPropagation();
            // mouseEvent?.stopImmediatePropagation();
            // connector.triggerSuggestionEvent(eventName, suggestion, mynahUI.getSearchPayload().selectedTab);
        },
        onResetStore: () => {},
        tabs: {
            'tab-1': {
                tabTitle: 'Welcome to Q',
                isSelected: true,
                store: {
                    ...initialData,
                    chatItems: [
                        {
                            type: ChatItemType.ANSWER,
                            body: `<span markdown="1">Hi, I am Q!          
          Ask me any software development questions. I can help explain, debug, or optimize code. 
          Or you can type \`/\` to see some suggested tasks.`,
                        },
                    ],
                    showChatAvatars: false,
                    quickActionCommands: [
                        {
                            groupName: 'Quick Action',
                            commands: [
                                {
                                    command: '/explain',
                                    description: 'Explain selected code or an active file',
                                },
                                {
                                    command: '/fix',
                                    description: 'Debug selected code and suggest fix',
                                },
                                {
                                    command: '/refactor',
                                    description: 'Refactor selected code',
                                },
                                {
                                    command: '/optimize',
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
                    ],
                    promptInputPlaceholder: 'Ask a question or "/" for capabilities',
                },
            },
        },
    })
}
