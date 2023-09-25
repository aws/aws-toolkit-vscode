/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
/* eslint-disable no-extra-bind */
import * as vscode from 'vscode'
import * as path from 'path'
import { ExtensionContext } from 'vscode'
import { PanelStore } from '../stores/panelStore'
import { messageIdentifier, MessageActionType, NotificationType, createChatContent } from '../models'
import { Session } from '../vue/chat/session'
import { LocalResolvedConfig } from '../types'
import { VirtualFileSystem } from '../../shared/virtualFilesystem'
import { ToolkitError } from '../../shared/errors'

export interface MynahDisplayProps {
    panelStore: PanelStore
}

export class WeaverbirdDisplay {
    private readonly assetsPath: vscode.Uri
    private readonly panelStore: PanelStore
    private uiReady: Record<string, boolean> = {}
    private backendConfig: LocalResolvedConfig
    private fs: VirtualFileSystem

    constructor(
        context: ExtensionContext,
        props: MynahDisplayProps,
        backendConfig: LocalResolvedConfig,
        fs: VirtualFileSystem
    ) {
        this.assetsPath = vscode.Uri.joinPath(context.extensionUri)
        this.panelStore = props.panelStore
        this.backendConfig = backendConfig
        this.fs = fs
    }

    private setupPanel(panelId: string): void {
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

        const workspaceFolders = vscode.workspace.workspaceFolders
        if (workspaceFolders === undefined || workspaceFolders.length === 0) {
            throw new ToolkitError('Can not initialize weaverbird chat when no workspace folder is present')
        }

        const workspaceRoot = workspaceFolders[0].uri.fsPath
        const addToChat = this.sendDataToUI.bind(this, panelId)
        const session = new Session(workspaceRoot, this.backendConfig, this.fs, addToChat)

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
                    // Ok here's a new prompt catched from the UI user interaction
                    // Lets roll the spinner
                    this.sendDataToUI(panelId, true, MessageActionType.SPINNER_STATE)

                    const chatPrompt = JSON.parse(msg.data)
                    const interactions = await session.send(chatPrompt.prompt)

                    for (const interaction of interactions) {
                        if (typeof interaction.content === 'string') {
                            this.sendDataToUI(
                                panelId,
                                createChatContent(interaction.content),
                                MessageActionType.CHAT_ANSWER
                            )
                        } else {
                            // TODO show the file picker view here instead
                            for (const content of interaction.content) {
                                this.sendDataToUI(panelId, createChatContent(content), MessageActionType.CHAT_ANSWER)
                            }
                        }
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
                    // Similar to clear.
                    // This time you can stop the streaming and if you like also send another nofication
                    // Please do not forget, nothing here is done by following your projects related UX sources (if you have any)
                    // They are all guidance purposes.
                    this.sendDataToUI(
                        panelId,
                        {
                            title: 'Cannot stop the streeaaam!!',
                            content: "Sorry i didn't implemented anything to stop the stream in the demo app",
                            type: NotificationType.WARNING,
                        },
                        MessageActionType.NOTIFY
                    )
                    break
            }
        })

        // When the panel closes
        panel.onDidDispose(_ => {
            // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
            delete this.uiReady[panelId]
            this.panelStore.deletePanel(panelId)
        })

        this.panelStore.savePanel(panelId, { webviewPanel: panel })

        this.generatePanel(panelId)
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
    public show(panelId: string): void {
        const panel = this.panelStore.getPanel(panelId ?? '')
        // eslint-disable-next-line no-null/no-null
        if (panel != null) {
            panel.webviewPanel.title = 'Weaverbird with Mynah UI Example'
            panel.webviewPanel.reveal(panel.webviewPanel.viewColumn, false)
        } else {
            this.setupPanel(panelId)
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
