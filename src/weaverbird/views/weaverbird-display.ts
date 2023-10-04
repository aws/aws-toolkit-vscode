/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
/* eslint-disable no-extra-bind */
import { ChatItemFollowUp } from '@aws/mynah-ui-chat'
import { existsSync } from 'fs'
import * as path from 'path'
import * as vscode from 'vscode'
import { ExtensionContext } from 'vscode'
import { weaverbirdScheme } from '../constants'
import {
    messageIdentifier,
    MessageActionType,
    NotificationType,
    createChatContent,
    ChatItemType,
    AddToChat,
} from '../models'
import { Session } from '../session/session'
import { createSessionConfig } from '../session/sessionConfigFactory'
import { PanelStore } from '../stores/panelStore'
import { FollowUpTypes, SessionStatePhase } from '../types'

export interface MynahDisplayProps {
    panelStore: PanelStore
}

export class WeaverbirdDisplay {
    private readonly assetsPath: vscode.Uri
    private readonly panelStore: PanelStore
    private uiReady: Record<string, boolean> = {}

    constructor(context: ExtensionContext, props: MynahDisplayProps) {
        this.assetsPath = vscode.Uri.joinPath(context.extensionUri)
        this.panelStore = props.panelStore
    }

    private async setupPanel(panelId: string): Promise<void> {
        const viewColumn = this.panelStore.getMostRecentPanel()?.webviewPanel.viewColumn ?? vscode.ViewColumn.Beside
        const panel = vscode.window.createWebviewPanel(
            'weaverbirdui-sample-extension',
            'Weaverbird with Mynah UI Example',
            viewColumn,
            {
                enableScripts: true,
                enableCommandUris: true,
                // To avoid refresh each time (which also causes the store to be reset) leave it true
                retainContextWhenHidden: true,
            }
        )

        const addToChat = this.sendDataToUI.bind(this, panelId)

        const sessionConfig = await createSessionConfig()
        const session = new Session(sessionConfig, addToChat)

        // Handle when a message recieved from the UI layer
        panel.webview.onDidReceiveMessage(async msg => {
            const panel = this.panelStore.getPanel(panelId)
            if (panel === undefined) {
                return
            }
            switch (msg.action) {
                case MessageActionType.UI_LOADED:
                    // Since this example is currently allowing multiple panels to run at the same time
                    // Keep them in a list that which is loaded and which is not
                    this.uiReady[panelId] = true
                    break
                case MessageActionType.PROMPT: {
                    this.sendDataToUI(panelId, true, MessageActionType.SPINNER_STATE)

                    try {
                        const chatPrompt = JSON.parse(msg.data)
                        const interactions = await session.send(chatPrompt.prompt)

                        for (const content of interactions.content) {
                            this.sendDataToUI(panelId, createChatContent(content), MessageActionType.CHAT_ANSWER)
                        }
                        if (interactions.filePaths != undefined && interactions.filePaths.length > 0) {
                            this.sendDataToUI(
                                panelId,
                                createChatContent(interactions.filePaths, ChatItemType.CODE_RESULT),
                                MessageActionType.CHAT_ANSWER
                            )
                        }

                        this.addFollowUpOptionsToChat(addToChat, session.state.phase)
                    } catch (err: any) {
                        const errorMessage = `Weaverbird API request failed: ${err.cause?.message ?? err.message}`
                        this.sendDataToUI(panelId, createChatContent(errorMessage), MessageActionType.CHAT_ANSWER)
                    }

                    // Spinner is no longer neccessary
                    this.sendDataToUI(panelId, false, MessageActionType.SPINNER_STATE)
                    break
                }
                case MessageActionType.CLEAR:
                    // OK there is a new UI user interaction
                    // Which is the clear
                    // You can clear the chat screen directly from the UI code however you may also want to do sth else
                    // Like adding a telemetry record or if you're keeping the chats in a cache clear them etc.
                    // I also wanted to showcase how you can show notifications inside the UI from the extension.
                    // If it is a system related message still use the native idea notifications btw.
                    this.sendDataToUI(
                        panelId,
                        {
                            title: 'Cleared the chat cache',
                            content: `Chat is also cleared from the cache but it is not real of course. 
            Just simulating the things here. And, this message comes from the extension side.`,
                            type: NotificationType.SUCCESS,
                        },
                        MessageActionType.NOTIFY
                    )
                    break
                case MessageActionType.STOP_STREAM:
                    this.sendDataToUI(
                        panelId,
                        {
                            title: 'Request cancelled',
                            content: '',
                            type: NotificationType.WARNING,
                        },
                        MessageActionType.NOTIFY
                    )

                    session.state.tokenSource.cancel()
                    break
                case MessageActionType.FOLLOW_UP_CLICKED: {
                    // Lock the chat box
                    this.sendDataToUI(panelId, true, MessageActionType.SPINNER_STATE)

                    const data = JSON.parse(msg.data)
                    switch (data?.type) {
                        // Followups after any approach phase state
                        case FollowUpTypes.WriteCode: {
                            try {
                                await session.startCodegen()
                                this.addFollowUpOptionsToChat(addToChat, session.state.phase)
                            } catch (err: any) {
                                const errorMessage = `Weaverbird API request failed: ${
                                    err.cause?.message ?? err.message
                                }`
                                this.sendDataToUI(
                                    panelId,
                                    createChatContent(errorMessage),
                                    MessageActionType.CHAT_ANSWER
                                )
                            }
                            break
                        }
                        // Followups after any codegen state
                        case FollowUpTypes.AcceptCode:
                            try {
                                await session.acceptChanges()
                            } catch (err: any) {
                                this.sendDataToUI(
                                    panelId,
                                    createChatContent(`Failed to accept code changes: ${err.message}`),
                                    MessageActionType.CHAT_ANSWER
                                )
                            }
                            break
                        case FollowUpTypes.RejectCode:
                            // TODO what we want to do here still needs to be discussed
                            break
                    }

                    // Unlock the chat box
                    this.sendDataToUI(panelId, false, MessageActionType.SPINNER_STATE)
                    break
                }
                case MessageActionType.OPEN_DIFF:
                    {
                        const diffParams = JSON.parse(msg.data)
                        const workspaceRoot = session.config.workspaceRoot ?? ''
                        const originalPath = path.join(workspaceRoot, diffParams.rightPath)
                        let left
                        if (existsSync(originalPath)) {
                            left = vscode.Uri.file(originalPath)
                        } else {
                            left = vscode.Uri.from({ scheme: weaverbirdScheme, path: 'empty' })
                        }

                        vscode.commands.executeCommand(
                            'vscode.diff',
                            left,
                            vscode.Uri.from({
                                scheme: weaverbirdScheme,
                                path: diffParams.rightPath,
                                query: `panelId=${panelId}`,
                            })
                        )
                    }

                    break
            }
        })

        // When the panel closes
        panel.onDidDispose(_ => {
            // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
            delete this.uiReady[panelId]
            this.panelStore.deletePanel(panelId)
        })

        this.panelStore.savePanel(panelId, { webviewPanel: panel, fs: sessionConfig.fs })

        this.generatePanel(panelId)
    }

    private addFollowUpOptionsToChat(addToChat: AddToChat, phase?: SessionStatePhase) {
        const followUpOptions = this.getFollowUpOptions(phase)
        if (followUpOptions.length > 0) {
            addToChat(
                {
                    type: ChatItemType.ANSWER,
                    followUp: {
                        text: 'Followup options',
                        options: followUpOptions,
                    },
                },
                MessageActionType.CHAT_ANSWER
            )
        }
    }

    private getFollowUpOptions(phase: SessionStatePhase | undefined): ChatItemFollowUp[] {
        switch (phase) {
            case SessionStatePhase.Approach:
                return [
                    {
                        pillText: 'Write Code',
                        type: FollowUpTypes.WriteCode,
                    },
                ]
            case SessionStatePhase.Codegen:
                return [
                    {
                        pillText: 'Accept changes',
                        type: FollowUpTypes.AcceptCode,
                    },
                    {
                        pillText: 'Reject and discuss',
                        type: FollowUpTypes.RejectCode,
                    },
                ]
            default:
                return []
        }
    }

    private generatePanel(panelId: string): void {
        this.uiReady[panelId] = false
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const panel = this.panelStore.getPanel(panelId)!
        // we're getting the js file location
        const source = path.join('src', 'weaverbird', 'ui', 'weaverbird-ui.js')
        const javascriptUri = vscode.Uri.joinPath(this.assetsPath, 'dist', source)

        const serverHostname = process.env.WEBPACK_DEVELOPER_SERVER
        const entrypoint =
            serverHostname !== undefined
                ? vscode.Uri.parse(serverHostname).with({ path: `/${source}` })
                : panel.webviewPanel.webview.asWebviewUri(javascriptUri)

        panel.webviewPanel.webview.html = getWebviewContent(entrypoint.toString())
    }

    // This is the message sender, which will send messages to UI
    private sendDataToUI(panelId: string, data: any, action: MessageActionType): void {
        const panel = this.panelStore.getPanel(panelId)

        if (panel === undefined) {
            return
        }

        if (this.uiReady[panelId]) {
            void panel.webviewPanel.webview.postMessage(
                JSON.stringify({
                    // using a unique identifier between the messages is pretty important
                    // since all the vscode extensions communicate by using post message
                    // and they all post it to window as there is no other option.
                    sender: messageIdentifier,
                    action,
                    data,
                })
            )
        } else {
            // If the ui for this panel is not ready yet, we're waiting it to be ready first.
            // until it gets ready
            setTimeout(() => {
                this.sendDataToUI(panelId, data, action)
            }, 50)
        }
    }

    // show or create and show a mynah-ui panel
    public async show(panelId: string): Promise<void> {
        const panel = this.panelStore.getPanel(panelId ?? '')
        // eslint-disable-next-line no-null/no-null
        if (panel != null) {
            panel.webviewPanel.title = 'Weaverbird with Mynah UI Example'
            panel.webviewPanel.reveal(panel.webviewPanel.viewColumn, false)
        } else {
            await this.setupPanel(panelId)
        }
    }
}

// this is your html markup
// you need to specify the element here
// to use while generating the mynah-ui
const getWebviewContent = (scriptUri: string): string => `
<!DOCTYPE html>
<html>
  <head>
    <title>Weaverbird</title>
    <script type="text/javascript" src="${scriptUri}" defer></script>
  </head>
  <body>
      <div id="amzn-mynah-ui-sample"></div>
  </body>
</html>
`
