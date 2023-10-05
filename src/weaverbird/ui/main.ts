/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { MynahUI, ChatPrompt, NotificationType } from '@aws/mynah-ui-chat'
import './styles/styles.scss'
import { ExtensionCommunicator } from './extensionCommunicator'
import { MessageActionType } from '../models'

export const createWeaverbirdUI = (): MynahUI => {
    // Creating a new connector between the UI and the extension
    // and attaching to the events in props to handle the recieved message
    // Check the extension-communicator.ts for reference
    // I've created this to make the communication layer apart from the UI itself.
    const extensionCommunicator = new ExtensionCommunicator({
        onChatItemRecieved: (tabId, chatItem) => {
            mynahUI.addChatAnswer(tabId, chatItem)
        },
        onChatStreamRecieved: (tabId, chatStream) => {
            mynahUI.updateLastChatAnswerStream(tabId, chatStream)
        },
        onLoadingStateChangeRecieved: (tabId, loadingState) => {
            mynahUI.updateStore(tabId, {
                loadingChat: loadingState,
            })
        },
        onNotificationRequestRecieved: notification => {
            mynahUI.notify({
                ...notification,
            })
        },
    })

    const mynahUI = new MynahUI({
        // this is the selector (doesn't have to be an ID) which you'll place the mynah-ui inside your markup
        rootSelector: '#amzn-mynah-ui-sample',
        // You can set the initials here.
        // For example if you want to start with a set of ChatItems already visible
        // fill the chatItems array with ChatItem objects.
        // They will appear initially when the UI is loaded.
        // Good for history recovering etc.
        // To inform the extension that the UI is ready
        // and it can send messages from now on
        onReady: () => {
            extensionCommunicator.sendMessageToExtension({
                action: MessageActionType.UI_LOADED,
            })
        },
        // If you connect to this event, it will show a button under the three dots menu
        // on the left of the send button which will open a feedback panel.
        onSendFeedback: (tabId: string, feedback) => {
            if (feedback.comment !== undefined) {
                mynahUI.notify({
                    title: 'Thanks for your feedback!',
                    content: `"${feedback.comment}" is sent to our team to build you a better experience.`,
                    type: NotificationType.INFO,
                })
            }
        },
        // Just calling a get function here which sends a message to the extension
        onChatPrompt: (tabId: string, prompt: ChatPrompt) => {
            extensionCommunicator.sendMessageToExtension({
                action: MessageActionType.PROMPT,
                data: prompt,
                tabId,
            })
        },
        // If you set this (even with an empty function)
        // It will change the send button to a stop button until the loadingChat state sets back to false
        onStopChatResponse: (tabId: string) => {
            mynahUI.updateStore(tabId, {
                loadingChat: false,
            })
            // Sending the request to extension to stop sending stream messages.
            extensionCommunicator.sendMessageToExtension({
                action: MessageActionType.STOP_STREAM,
                tabId,
            })
        },
        // Informing you about which follow up is selected.
        onFollowUpClicked: (tabId, followUp) => {
            // Get answer from the followup question, we're just using the prompt here.
            extensionCommunicator.sendMessageToExtension({
                action: MessageActionType.FOLLOW_UP_CLICKED,
                data: followUp,
                tabId,
            })
        },

        onOpenDiff: (tabId: string, leftPath: string, rightPath: string) => {
            extensionCommunicator.sendMessageToExtension({
                action: MessageActionType.OPEN_DIFF,
                data: { leftPath, rightPath },
                tabId,
            })
        },
    })

    return mynahUI
}

window.weaverbirdUI = createWeaverbirdUI()
