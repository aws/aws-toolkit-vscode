/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    EventEmitter,
    CancellationToken,
    Webview,
    WebviewView,
    WebviewViewProvider,
    WebviewViewResolveContext,
    Uri,
} from 'vscode'
import { LanguageServerResolver } from 'aws-core-vscode/shared'
import { QuickActionCommandGroup } from '@aws/mynah-ui'

export class AmazonQChatViewProvider implements WebviewViewProvider {
    public static readonly viewType = 'aws.amazonq.AmazonQChatView'
    private readonly onDidResolveWebviewEmitter = new EventEmitter<void>()
    public readonly onDidResolveWebview = this.onDidResolveWebviewEmitter.event

    webview: Webview | undefined

    private readonly quickActionCommands: QuickActionCommandGroup[] = [
        {
            groupName: 'Quick Actions',
            commands: [
                {
                    command: '/help',
                    icon: 'help',
                    description: 'Learn more about Amazon Q',
                },
                {
                    command: '/clear',
                    icon: 'trash',
                    description: 'Clear this session',
                },
            ],
        },
    ]

    constructor(private readonly mynahUIPath: string) {}

    public resolveWebviewView(webviewView: WebviewView, context: WebviewViewResolveContext, _token: CancellationToken) {
        this.webview = webviewView.webview

        const lspDir = Uri.parse(LanguageServerResolver.defaultDir)
        webviewView.webview.options = {
            enableScripts: true,
            enableCommandUris: true,
            localResourceRoots: [lspDir],
        }

        const uiPath = webviewView.webview.asWebviewUri(Uri.parse(this.mynahUIPath)).toString()
        webviewView.webview.html = this.getWebviewContent(uiPath)

        this.onDidResolveWebviewEmitter.fire()
    }

    private getWebviewContent(mynahUIPath: string) {
        return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Chat</title>
            <style>
                body,
                html {
                    background-color: var(--mynah-color-bg);
                    color: var(--mynah-color-text-default);
                    height: 100%;
                    width: 100%;
                    overflow: hidden;
                    margin: 0;
                    padding: 0;
                }
            </style>
        </head>
        <body>
            <script type="text/javascript" src="${mynahUIPath.toString()}" defer onload="init()"></script>
            <script type="text/javascript">
                const init = () => {
                    amazonQChat.createChat(acquireVsCodeApi(), { disclaimerAcknowledged: false, quickActionCommands: ${JSON.stringify(this.quickActionCommands)}});
                }
            </script>
        </body>
        </html>`
    }
}
