/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import globals from '../../shared/extensionGlobals'
import path from 'path'
import { MessagePublisher } from '../messages/messagePublisher'
import { telemetry } from '../../shared/telemetry/telemetry'
import { getLogger } from '../../shared/logger'
import { placeholder } from '../../shared/vscode/commands2'
import { focusAmazonQPanel } from '../../codewhispererChat/commands/registerCommands'

export function welcome(context: vscode.ExtensionContext, cwcWebViewToAppsPublisher: MessagePublisher<any>): void {
    const panel = vscode.window.createWebviewPanel(
        'amazonQWelcome',
        'Meet Amazon Q (Preview)',
        vscode.ViewColumn.Active,
        {
            enableScripts: true,
        }
    )

    // TODO: get svg gradient icon and use `getIcon` (currently only works with svg)
    panel.iconPath = vscode.Uri.file(
        globals.context.asAbsolutePath(path.join('resources', 'icons', 'aws', 'amazonq', 'q-gradient.svg'))
    )

    panel.webview.html = getWebviewContent(panel.webview)

    // Handle messages from the webview
    panel.webview.onDidReceiveMessage(
        message => {
            telemetry.ui_click.run(() => {
                switch (message.command) {
                    case 'sendToQ':
                        telemetry.record({ elementId: 'amazonq_meet_askq' })
                        focusAmazonQPanel.execute(placeholder, 'sendToQ').then(
                            () => {
                                cwcWebViewToAppsPublisher.publish({
                                    type: 'onboarding-page-cwc-button-clicked',
                                    command: 'onboarding-page-interaction',
                                })
                            },
                            e => {
                                getLogger().error('focusAmazonQPanel failed: %s', (e as Error).message)
                            }
                        )

                        return

                    case 'goToHelp':
                        telemetry.record({ elementId: 'amazonq_tryExamples' })
                        void vscode.commands.executeCommand('aws.codeWhisperer.gettingStarted')
                        return
                }
            })
        },
        undefined,
        context.subscriptions
    )

    // user closes webview
    // does this fire on IDE shutdown?
    panel.onDidDispose(() => {
        telemetry.ui_click.emit({
            elementId: 'amazonq_closeWebview',
            passive: true,
        })
    })
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
            body {
                height: 100vh;
            }
            #bg {
                position: fixed;
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
                cursor: pointer;
            }
            #wrapper {
                height: 100%;
                width: 100%;
                min-width: 600px;
                overflow-y: auto;
                overflow-x: auto;
                display: flex;
                flex-direction: row;
                justify-content: center;
                align-items: center;
            }
            #content {
                max-width: 550px;
                padding: 30px;
                display: flex;
                flex-direction: column;
                gap: 30px;
                align-items: center;
            }
            #codewhisperer {
                display: flex;
                align-items: center;
                flex-direction: row;
                gap: 40px;
                flex-wrap: nowrap;
            }
            #codewhisperer div p {
                margin: 0px;
                font-size: 12pt;
            }
            #qLogo {
                width: 70px
            }
            #imageContainer {
                width: 40px;
                height: auto;
                flex-shrink: 0;
                flex-grow: 0;
            }
            #textWrapper {
                flex-shrink: 1;
                flex-grow: 1;
            }
            #header {
                text-align: center;
                margin: 0;
            }
            a {
                cursor: pointer;
            }
            .spacingrow {
                display: flex;
                flex-direction: row;
                gap: 40px;
                flex-wrap: nowrap;
            }
            </style>
        </head>
        <body>
            <img id="bg">
            <div id="wrapper">
                <div id="content">
                    <img id="qLogo" src="${logo}"/>
                    <h1 id="header">Hello! I'm Amazon Q, your generative AI assistant.</h1>
                    <div id="buttonContainer">
                        <button id="sendToQButton">Ask a question</button>
                    </div>
                    <!-- spacing -->
                    <div class="spacingrow"> </div>
                    <div class="spacingrow"> </div>
                    <!-- end spacing -->
                    <div id="codewhisperer">
                        <div id="imageContainer">
                            <img id="codewhispererLogo"/>
                        </div>
                        <div id="textWrapper">
                            <p>CodeWhisperer inline suggestions are also enabled.<br><a id="goToHelpLink">Try examples</a></p>
                        </div>
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
