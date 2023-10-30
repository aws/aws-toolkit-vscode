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

export const createMynahUI = (weaverbirdEnabled: boolean, initialData?: MynahUIDataModel) => {
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
                mynahUI.addChatItem(selectedTab.id, message)
                tabsStorage.updateTabStatus(selectedTab.id, 'busy')

                return selectedTab.id
            }

            const newTabID = mynahUI.updateStore('', {
                tabTitle: 'Chat',
                chatItems: [message],
                showChatAvatars: false,
                quickActionCommands: QuickActionCommands(weaverbirdEnabled),
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
                return
            }
        },
        onAsyncFollowUpClicked: (tabID: string, inProgress: boolean, message: string | undefined) => {
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
            if (item.type === ChatItemType.ANSWER_PART) {
                mynahUI.updateLastChatAnswer(tabID, {
                    ...(item.messageId !== undefined ? { messageId: item.messageId } : {}),
                    ...(item.canBeVoted !== undefined ? { canBeVoted: item.canBeVoted } : {}),
                    ...(item.codeReference !== undefined ? { codeReference: item.codeReference } : {}),
                    ...(item.body !== undefined ? { body: item.body } : {}),
                    ...(item.relatedContent !== undefined ? { relatedContent: item.relatedContent } : {}),
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

            mynahUI.addChatItem(tabID, answer)
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
            if ((prompt.prompt ?? '') === '' && (prompt.command ?? '') === '') {
                return
            }
            if (weaverbirdEnabled && prompt.command !== undefined && prompt.command.trim() !== '') {
                if (prompt.command === '/assign') {
                    let affectedTabId = tabID
                    const realPromptText = prompt.escapedPrompt?.trim() ?? ''
                    if (tabsStorage.getTab(affectedTabId)?.type !== 'unknown') {
                        affectedTabId = mynahUI.updateStore('', {})
                    }
                    tabsStorage.updateTabTypeFromUnknown(affectedTabId, 'wb')
                    connector.onKnownTabOpen(affectedTabId)

                    mynahUI.updateStore(affectedTabId, { chatItems: [] })
                    mynahUI.updateStore(affectedTabId, {
                        tabTitle: 'Q - Task',
                        quickActionCommands: [],
                        promptInputPlaceholder: 'Assign a code task',
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
                        connector.requestGenerativeAIAnswer(affectedTabId, {
                            chatMessage: realPromptText,
                        })
                    }

                    return
                } else if (prompt.command === '/clear') {
                    // TODO clear command should also be sent to extension,
                    // command sending is already added,
                    // however the extension layer doesn't do anything with it yet
                    // it should clear the cache or anything related with that tab
                    mynahUI.updateStore(tabID, {
                        chatItems: [],
                    })
                    return
                } else {
                    // TODO we should send all commands to the extension
                    // which is implemented but the extension should handle them
                }
            }

            tabsStorage.updateTabTypeFromUnknown(tabID, 'cwc')
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
            connector.onFollowUpClicked(tabID, followUp)
        },
        onOpenDiff: connector.onOpenDiff,
        onStopChatResponse: (tabID: string) => {
            mynahUI.updateStore(tabID, {
                loadingChat: false,
                promptInputDisabledState: false,
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
                            followUp: WelcomeFollowUps(weaverbirdEnabled),
                        },
                    ],
                    showChatAvatars: false,
                    quickActionCommands: QuickActionCommands(weaverbirdEnabled),
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
                        followUp: WelcomeFollowUps(weaverbirdEnabled),
                    },
                ],
                showChatAvatars: false,
                quickActionCommands: QuickActionCommands(weaverbirdEnabled),
                promptInputPlaceholder: 'Ask a question or "/" for capabilities',
            },
        },
    })
}
