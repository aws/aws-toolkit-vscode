/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import globals from '../../shared/extensionGlobals'
import path from 'path'
import { MessagePublisher } from '../messages/messagePublisher'
import { focusAmazonQPanel } from '../../codewhisperer/commands/basicCommands'

export function welcome(context: vscode.ExtensionContext, cwcWebViewToAppsPublisher: MessagePublisher<any>): void {
    const panel = vscode.window.createWebviewPanel('amazonQWelcome', 'Meet Amazon Q (Preview)', vscode.ViewColumn.Active, {
        enableScripts: true,
    })

    // TODO: get svg gradient icon and use `getIcon` (currently only works with svg)
    panel.iconPath = vscode.Uri.file(
        globals.context.asAbsolutePath(path.join('resources', 'icons', 'aws', 'amazonq', 'q-gradient.svg'))
    )

    panel.webview.html = getWebviewContent(panel.webview)

    // Handle messages from the webview
    panel.webview.onDidReceiveMessage(
        message => {
            switch (message.command) {
                case 'sendToQ':
                    focusAmazonQPanel().then(() => {
                        cwcWebViewToAppsPublisher.publish({
                            type: 'onboarding-page-cwc-button-clicked',
                            command: 'onboarding-page-interaction',
                        })
                    })

                    return

                case 'goToHelp':
                    vscode.commands.executeCommand('aws.codeWhisperer.gettingStarted')
                    return
            }
        },
        undefined,
        context.subscriptions
    )
}

function getWebviewContent(webview: vscode.Webview): string {
    const logo = webview.asWebviewUri(
        vscode.Uri.file(
            globals.context.asAbsolutePath(path.join('resources', 'icons', 'aws', 'amazonq', 'q-gradient.svg'))
        )
    )
    const bgLogoLight = webview.asWebviewUri(
        vscode.Uri.file(
            globals.context.asAbsolutePath(path.join('resources', 'icons', 'aws', 'amazonq', 'q-squid-ink.svg'))
        )
    )
    const bgLogoDark = webview.asWebviewUri(
        vscode.Uri.file(
            globals.context.asAbsolutePath(path.join('resources', 'icons', 'aws', 'amazonq', 'q-white.svg'))
        )
    )
    const cwLogoLight = webview.asWebviewUri(
        vscode.Uri.file(
            globals.context.asAbsolutePath(path.join('resources', 'icons', 'aws', 'codewhisperer', 'icon-black.svg'))
        )
    )
    const cwLogoDark = webview.asWebviewUri(
        vscode.Uri.file(
            globals.context.asAbsolutePath(path.join('resources', 'icons', 'aws', 'codewhisperer', 'icon-white.svg'))
        )
    )
    return `
    <!DOCTYPE html>
    <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta http-equiv="Content-Security-Policy"
                content="default-src 'none';
                font-src ${webview.cspSource};
                script-src 'self' 'unsafe-inline';
                style-src 'self' 'unsafe-inline' ${webview.cspSource};
                img-src ${webview.cspSource}"
            >
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
            body {
                height: 100vh;
                overflow: hidden;
                position: relative;
            }
            body.vscode-light #bg {
                content: url(${bgLogoLight});
                opacity: 0.05;
            }
            body.vscode-dark #bg {
                content: url(${bgLogoDark});
                opacity: 0.05;
            }
            body.vscode-light #codewhispererLogo {
                content: url(${cwLogoLight})
            }
            body.vscode-dark #codewhispererLogo {
                content: url(${cwLogoDark})
            }
            #bg {
                position: absolute;
                left: 70%;
                top: -10%;
                overflow: hidden;
                transform: scale(2);
                pointer-events:none;
                user-select: none;
            }
            #sendToQButton {
                background: linear-gradient(14deg, rgba(52,20,120,1) 0%, rgba(91,41,196,1) 25%, rgba(117,55,247,1) 50%, rgba(73,125,254,1) 75%, rgba(170,233,255,1) 100%);
                color: white;
                border-radius: 6px;
                border: none;
                font-size: 20px;
                padding: 0.5em 1em;
                text-align: center;
            }
            #content {
                margin: auto;
                width: 50%;
                text-align: center;
                width: 800px;
                transform: translateY(30vh);
            }
            #codewhisperer {
                padding-left: 15%;
                text-align: left;
                padding-right: 15%;
                margin-top: 50px;
            }
            #codewhisperer div{
                float: left;
                margin-left: 1em;
                padding: 1em;
            }
            #codewhisperer div p {
                margin: 0px;
                font-size: 12pt;
            }
            #qLogo {
                width: 10%
            }
            #imageContainer {
                width: 40px;
                height: auto;
            }
            #header {
                width: 60%; 
                margin: 50px auto;
            }
            a {
                cursor: pointer;
            }
            </style>
        </head>
        <body>
            <img id="bg">
            <div id="content">
                <img id="qLogo" src="${logo}"/>
                <h1 id="header">Amazon Q (Preview) is a generative AI-powered conversational assistant.</h1>
                <div id="buttonContainer">
                    <button id="sendToQButton">"What can Q help me with?"</button>
                </div>
                <div id="codewhisperer">
                    <div id="imageContainer">
                        <img id="codewhispererLogo"/>
                    </div>
                    <div id="textWrapper">
                        <p>Inline suggestions powered by CodeWhisperer are enabled.<br><a id="goToHelpLink">Try Examples</a></p>
                    </div>
                </div>
            </div>
            <script>
                (function() {
                    const vscode = acquireVsCodeApi()
                    const sendToQ = () => { vscode.postMessage({ command: "sendToQ" }) }
                    const goToHelp = () => { vscode.postMessage({ command: "goToHelp" }) }
                    const sendToQButton = document.getElementById('sendToQButton')
                    sendToQButton.onclick = sendToQ
                    const goToHelpLink = document.getElementById('goToHelpLink')
                    goToHelpLink.onclick = goToHelp
                }())
            </script>
        </body>
    </html>
    `
}
