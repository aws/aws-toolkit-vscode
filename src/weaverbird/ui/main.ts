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
        onChatItemRecieved: chatItem => {
            mynahUI.addChatAnswer(chatItem)
        },
        onChatStreamRecieved: chatStream => {
            mynahUI.updateLastChatAnswerStream(chatStream)
        },
        onLoadingStateChangeRecieved: loadingState => {
            mynahUI.updateStore({
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
        storeData: {
            showChatAvatars: false,
        },
        // To inform the extension that the UI is ready
        // and it can send messages from now on
        onReady: () => {
            extensionCommunicator.sendMessageToExtension({
                action: MessageActionType.UI_LOADED,
            })
        },
        // If you connect to this event, it will show a button under the three dots menu
        // on the left of the send button which will open a feedback panel.
        onSendFeedback: feedback => {
            if (feedback.comment !== undefined) {
                mynahUI.notify({
                    title: 'Thanks for your feedback!',
                    content: `"${feedback.comment}" is sent to our team to build you a better experience.`,
                    type: NotificationType.INFO,
                })
            }
        },
        // Just calling a get function here which sends a message to the extension
        onChatPrompt: (prompt: ChatPrompt) => {
            getGenerativeAIAnswer(prompt)
        },
        // If you set this (even with an empty function)
        // It will change the send button to a stop button until the loadingChat state sets back to false
        onStopChatResponse: () => {
            mynahUI.updateStore({
                loadingChat: false,
            })
            // Sending the request to extension to stop sending stream messages.
            extensionCommunicator.sendMessageToExtension({
                action: MessageActionType.STOP_STREAM,
            })
        },
        // Informing you about which follow up is selected.
        onFollowUpClicked: followUp => {
            // Get answer from the followup question, we're just using the prompt here.
            getGenerativeAIAnswer({ prompt: followUp.prompt })
        },
        // If you connect to this event, it will show a button under the three dots menu
        // on the left of the send button which is names Clear chat and will trigger this function
        onClearChat: () => {
            // if you want to clear the screen directly do here,
            // or handle it in the communicator event
            mynahUI.updateStore({
                chatItems: [],
            })
            // Sending message to extension (you may want to create a telemetry record for example)
            extensionCommunicator.sendMessageToExtension({
                action: MessageActionType.CLEAR,
            })
        },
    })

    // Calling the extension layer here, nothing more than that.
    // To get answers we're waiting for the incoming messages all the time
    // No promises possible for postMessage structures.
    // Since we don't know if the message we've sent is catched and when the answer will come
    const getGenerativeAIAnswer = (prompt: ChatPrompt): void => {
        extensionCommunicator.sendMessageToExtension({
            action: MessageActionType.PROMPT,
            data: prompt,
        })
    }

    return mynahUI
}

window.weaverbirdUI = createWeaverbirdUI()
