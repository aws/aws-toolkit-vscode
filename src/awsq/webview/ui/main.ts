/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { ChatPayload, Connector } from './connector'
import { ChatItem, ChatItemType, MynahUI, MynahUIDataModel, NotificationType } from '@aws/mynah-ui-chat'
import './styles/dark.scss'
import { ChatPrompt } from '@aws/mynah-ui-chat/dist/static'
import { TabsStorage } from './storages/tabsStorage'
import { WelcomeFollowupType } from './apps/awsqCommonsConnector'

const WelcomeMessage = `Hi, I am AWS Q. I can answer your software development questions. 
Ask me to explain, debug, or optimize your code. 
You can enter \`/\` to see a list of quick actions.`
const WeaverBirdWelcomeMessage = `### How \`/assign\` works:
1. Describe your job to be done
2. Agree on an approach
3. Q generate code
4. Review code suggestions, provide feedback if needed`

const WelcomeFollowUps = (weaverbirdEnabled: boolean) => ({
    text: 'Or you can select one of these',
    options: [
        ...(weaverbirdEnabled
            ? [
                  {
                      pillText: 'I want to assign a code task',
                      type: 'assign-code-task',
                  },
              ]
            : []),
        {
            pillText: 'I have a software development question',
            type: 'continue-to-chat',
        },
    ],
})

const QuickActionCommands = (weaverbirdEnabled: boolean) => [
    ...(weaverbirdEnabled
        ? [
              {
                  groupName: 'Start a workflow',
                  commands: [
                      {
                          command: '/assign',
                          placeholder: 'Please specify the coding task in details',
                          description: 'Give Q a coding task',
                      },
                  ],
              },
          ]
        : []),
    // TODO after implementing the command handlers on the extension side
    // those items should be enabled one by one
    /* {
    groupName: 'Quick Actions',
    commands: [
    {
        command: '/explain',
        description: 'Explain the selected code or active file',
    },
    {
        command: '/fix',
        placeholder: 'Please specify what to fix, ie: selected code or the active file',
        description: 'Fix the selected code or active file',
    },
    {
        command: '/refactor',
        description: 'Explain the selected code or active file',
    },
    {
        command: '/optimize',
        description: 'Explain the selected code or active file',
    },
    ],
}, */
    {
        commands: [
            {
                command: '/clear',
                description: 'Clear this session',
            },
        ],
    },
]

export const createMynahUI = (weaverbirdInitEnabled: boolean, initialData?: MynahUIDataModel) => {
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

    // used to keep track of whether or not weaverbird is enabled and has an active idC
    let isWeaverbirdEnabled = weaverbirdInitEnabled

    const connector = new Connector({
        tabsStorage,
        onUpdateAuthentication: (weaverbirdEnabled: boolean): void => {
            const selectedTab = tabsStorage.getSelectedTab()

            isWeaverbirdEnabled = weaverbirdEnabled

            if (!selectedTab) {
                return
            }

            /**
             * If someone switches authentication when they're on the main page then reset the chat items and the quick actions
             * and that triggers a change in weaverbird availability
             */
            if (selectedTab?.type === 'unknown') {
                mynahUI.updateStore(selectedTab.id, {
                    chatItems: [],
                })
                mynahUI.updateStore(selectedTab.id, {
                    chatItems: [
                        {
                            type: ChatItemType.ANSWER,
                            body: WelcomeMessage,
                        },
                    ],
                    quickActionCommands: QuickActionCommands(isWeaverbirdEnabled),
                })
                mynahUI.addChatItem(selectedTab.id, {
                    type: ChatItemType.ANSWER,
                    followUp: WelcomeFollowUps(isWeaverbirdEnabled),
                })
            }
        },
        onCWCContextCommandMessage: (message: ChatItem, command?: string): string => {
            const selectedTab = tabsStorage.getSelectedTab()

            if (selectedTab !== undefined && command === 'aws.awsq.sendToPrompt') {
                mynahUI.addToUserPrompt(selectedTab.id, message.body as string)
                return selectedTab.id
            }

            if (selectedTab !== undefined && selectedTab.type === 'cwc' && selectedTab.status === 'free') {
                mynahUI.updateStore(selectedTab.id, {
                    loadingChat: true,
                    promptInputDisabledState: true,
                })
                mynahUI.addChatItem(selectedTab.id, message)
                mynahUI.addChatItem(selectedTab.id, {
                    type: ChatItemType.ANSWER_STREAM,
                    body: '',
                })
                tabsStorage.updateTabStatus(selectedTab.id, 'busy')

                return selectedTab.id
            }

            const newTabID = mynahUI.updateStore('', {
                tabTitle: 'Chat',
                chatItems: [message],
                showChatAvatars: false,
                quickActionCommands: QuickActionCommands(isWeaverbirdEnabled),
                promptInputPlaceholder: 'Ask a question or "/" for capabilities',
            })
            mynahUI.addChatItem(newTabID, {
                type: ChatItemType.ANSWER_STREAM,
                body: '',
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
                openInteractionType: 'contextMenu',
            })

            tabsStorage.updateTabTypeFromUnknown(newTabID, 'cwc')
            connector.onUpdateTabType(newTabID)
            tabsStorage.updateTabStatus(newTabID, 'busy')

            return newTabID
        },
        onWelcomeFollowUpClicked: (tabID: string, welcomeFollowUpType: WelcomeFollowupType) => {
            if (welcomeFollowUpType === 'assign-code-task') {
                const newTabId = mynahUI.updateStore('', {
                    tabTitle: 'Q - Task',
                    quickActionCommands: [],
                    promptInputPlaceholder: 'What problem do you want to fix?',
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
                    openInteractionType: 'click',
                })

                tabsStorage.updateTabTypeFromUnknown(tabID, 'cwc')
                connector.onUpdateTabType(tabID)
                tabsStorage.updateTabTypeFromUnknown(newTabId, 'wb')
                connector.onUpdateTabType(newTabId)

                // Let weaverbird know a wb tab has been opened
                connector.onKnownTabOpen(newTabId)
                return
            }

            if (welcomeFollowUpType === 'continue-to-chat') {
                mynahUI.addChatItem(tabID, {
                    type: ChatItemType.ANSWER,
                    body: 'Ok, please write your question below.',
                })
                tabsStorage.updateTabTypeFromUnknown(tabID, 'cwc')
                connector.onUpdateTabType(tabID)
                return
            }
        },
        onChatInputEnabled: (tabID: string, enabled: boolean) => {
            mynahUI.updateStore(tabID, {
                promptInputDisabledState: !enabled,
            })
        },
        onAsyncEventProgress: (tabID: string, inProgress: boolean, message: string | undefined) => {
            if (inProgress) {
                mynahUI.updateStore(tabID, {
                    loadingChat: true,
                    promptInputDisabledState: true,
                })
                if (message) {
                    mynahUI.addChatItem(tabID, {
                        type: ChatItemType.ANSWER,
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
                promptInputDisabledState: false,
            })
            tabsStorage.updateTabStatus(tabID, 'free')
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
                    ...(item.type === ChatItemType.CODE_RESULT ? { type: ChatItemType.CODE_RESULT } : {}),
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
                body: `**${title}** 
${message}`,
            }

            if (tabID !== '') {
                mynahUI.updateStore(tabID, {
                    loadingChat: false,
                    promptInputDisabledState: false,
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
                // TODO remove this since it will be added with the onTabAdd and onTabAdd is now sync,
                // It means that it cannot trigger after the updateStore function returns.
                tabsStorage.addTab({
                    id: newTabId,
                    status: 'busy',
                    type: 'unknown',
                    isSelected: true,
                })
            }
            return
        },
        onUpdatePlaceholder(tabID: string, newPlaceholder: string) {
            mynahUI.updateStore(tabID, {
                promptInputPlaceholder: newPlaceholder,
            })
        },
    })

    mynahUI = new MynahUI({
        onReady: connector.uiReady,
        onTabAdd: connector.onTabAdd,
        onTabRemove: connector.onTabRemove,
        onTabChange: connector.onTabChange,
        onChatPrompt: (tabID: string, prompt: ChatPrompt) => {
            if ((prompt.prompt ?? '') === '' && (prompt.command ?? '') === '') {
                return
            }
            if (prompt.command !== undefined && prompt.command.trim() !== '') {
                if (isWeaverbirdEnabled && prompt.command === '/assign') {
                    let affectedTabId = tabID
                    const realPromptText = prompt.escapedPrompt?.trim() ?? ''
                    if (tabsStorage.getTab(affectedTabId)?.type !== 'unknown') {
                        affectedTabId = mynahUI.updateStore('', {})
                    }
                    tabsStorage.updateTabTypeFromUnknown(affectedTabId, 'wb')
                    connector.onKnownTabOpen(affectedTabId)
                    connector.onUpdateTabType(affectedTabId)

                    mynahUI.updateStore(affectedTabId, { chatItems: [] })
                    mynahUI.updateStore(affectedTabId, {
                        tabTitle: 'Q - Task',
                        quickActionCommands: [],
                        promptInputPlaceholder: 'What problem do you want to fix?',
                        chatItems: [
                            ...(realPromptText !== ''
                                ? []
                                : [
                                      {
                                          type: ChatItemType.ANSWER,
                                          body: WeaverBirdWelcomeMessage,
                                      },
                                  ]),
                        ],
                    })

                    if (realPromptText !== '') {
                        mynahUI.addChatItem(affectedTabId, {
                            type: ChatItemType.PROMPT,
                            body: realPromptText,
                            ...(prompt.attachment !== undefined
                                ? {
                                      relatedContent: {
                                          content: [prompt.attachment],
                                      },
                                  }
                                : {}),
                        })

                        mynahUI.addChatItem(affectedTabId, {
                            type: ChatItemType.ANSWER_STREAM,
                            body: '',
                        })

                        mynahUI.updateStore(affectedTabId, {
                            loadingChat: true,
                            promptInputDisabledState: true,
                        })

                        connector.requestGenerativeAIAnswer(affectedTabId, {
                            chatMessage: realPromptText,
                        })
                    }

                    return
                } else if (prompt.command === '/clear') {
                    mynahUI.updateStore(tabID, {
                        chatItems: [],
                    })
                    connector.clearChat(tabID)

                    return
                } else {
                    // TODO we should send all commands to the extension
                    // which is implemented but the extension should handle them
                }
            }

            tabsStorage.updateTabTypeFromUnknown(tabID, 'cwc')
            connector.onUpdateTabType(tabID)
            mynahUI.addChatItem(tabID, {
                type: ChatItemType.PROMPT,
                body: prompt.escapedPrompt,
                ...(prompt.attachment !== undefined
                    ? {
                          relatedContent: {
                              content: [prompt.attachment],
                          },
                      }
                    : {}),
            })
            mynahUI.addChatItem(tabID, {
                type: ChatItemType.ANSWER_STREAM,
                body: '',
            })

            mynahUI.updateStore(tabID, {
                loadingChat: true,
                promptInputDisabledState: true,
            })

            tabsStorage.updateTabStatus(tabID, 'busy')
            const chatPayload: ChatPayload = {
                chatMessage: prompt.prompt ?? '',
                chatCommand: prompt.command,
            }

            connector.requestGenerativeAIAnswer(tabID, chatPayload).then(i => {})
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
            // mouseEvent?.preventDefault();
            // mouseEvent?.stopPropagation();
            // mouseEvent?.stopImmediatePropagation();
            // connector.triggerSuggestionEvent(eventName, suggestion, mynahUI.getSearchPayload().selectedTab);
        },
        onLinkClick: (tabId, messageId, link, mouseEvent) => {
            // mouseEvent?.preventDefault();
            // mouseEvent?.stopPropagation();
            // mouseEvent?.stopImmediatePropagation();
            // connector.triggerSuggestionEvent(eventName, suggestion, mynahUI.getSearchPayload().selectedTab);
        },
        onResetStore: () => {},
        onFollowUpClicked: (tabID, messageId, followUp) => {
            // we need to check if there is a prompt
            // which will cause an api call
            // then we can set the loading state to true
            if (followUp.prompt !== undefined) {
                mynahUI.updateStore(tabID, {
                    loadingChat: true,
                    promptInputDisabledState: true,
                })
                mynahUI.addChatItem(tabID, {
                    type: ChatItemType.PROMPT,
                    body: followUp.prompt,
                })
                mynahUI.addChatItem(tabID, {
                    type: ChatItemType.ANSWER_STREAM,
                    body: '',
                })
                tabsStorage.updateTabStatus(tabID, 'busy')
            }
            connector.onFollowUpClicked(tabID, messageId, followUp)
        },
        onOpenDiff: connector.onOpenDiff,
        // onStopChatResponse: (tabID: string) => {
        //     mynahUI.updateStore(tabID, {
        //         loadingChat: false,
        //         promptInputDisabledState: false,
        //     })
        //     connector.onStopChatResponse(tabID)
        // },
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
                            followUp: WelcomeFollowUps(isWeaverbirdEnabled),
                        },
                    ],
                    showChatAvatars: false,
                    quickActionCommands: QuickActionCommands(isWeaverbirdEnabled),
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
                        followUp: WelcomeFollowUps(isWeaverbirdEnabled),
                    },
                ],
                showChatAvatars: false,
                quickActionCommands: QuickActionCommands(isWeaverbirdEnabled),
                promptInputPlaceholder: 'Ask a question or "/" for capabilities',
            },
        },
    })
}
