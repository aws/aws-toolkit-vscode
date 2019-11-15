/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as path from 'path'
import * as vscode from 'vscode'
import { ext } from '../../shared/extensionGlobals'
import { getLogger, Logger } from '../../shared/logger'
import { updateCache } from '../utils'

export interface messageObject {
    command: string,
    text: string,
    error?: string,
    stateMachineData: string
}

/**
 * Graphs the state machine defined in the current active editor
 */
export async function visualizeStateMachine(globalStorage: vscode.Memento): Promise<vscode.WebviewPanel | void> {
    const logger: Logger = getLogger()

    /* TODO: Determine behaviour when command is run against bad input, or
     * non-json files. Determine if we want to limit the command to only a
     * specifc subset of file types ( .json only, custom .states extension, etc...)
     * Ensure tests are written for this use case as well.
     */
    const activeTextEditor: vscode.TextEditor | undefined = vscode.window.activeTextEditor

    let documentUri: vscode.Uri
    let documentText: string

    if (activeTextEditor) {
        documentUri = activeTextEditor.document.uri
        documentText = activeTextEditor.document.getText()
    } else {
        logger.error('Could not grab active text editor for state machine render.')
        throw new Error('Could not grab active text editor for state machine render.')
    }

    return updateCache(globalStorage).then( async () => {
        return setupWebviewPanel(documentUri, documentText)
    }).catch( () => {
        logger.debug('Didnt setup webview panel due to error pulling files from CloudFront')

        return
    })
}

async function setupWebviewPanel(
    documentUri: vscode.Uri,
    documentText: string
): Promise<vscode.WebviewPanel> {
    const logger: Logger = getLogger()

    // Create and show panel
    const panel = vscode.window.createWebviewPanel(
        'stateMachineVisualization',
        makeWebviewTitle(documentUri),
        vscode.ViewColumn.Beside,
        {
            enableScripts: true,
            localResourceRoots: [
                ext.visualizationResourcePaths.localScriptsPath,
                ext.visualizationResourcePaths.visualizationCache
            ],
            retainContextWhenHidden: true
        }
    )

    // Set the initial html for the webpage
    panel.webview.html = getWebviewContent(
        ext.visualizationResourcePaths.webviewScript.with({ scheme: 'vscode-resource' }),
        ext.visualizationResourcePaths.visualizationScript.with({ scheme: 'vscode-resource' }),
        ext.visualizationResourcePaths.visualizationCSS.with({ scheme: 'vscode-resource' })
    )

    // Add listener function to update the graph on document save
    const updateOnSaveDisposable = vscode.workspace.onDidSaveTextDocument(textDocument => {
        if (textDocument && textDocument.uri === documentUri) {
            logger.debug('Sending update message to webview.')
            panel.webview.postMessage({
                command: 'update',
                stateMachineData: textDocument.getText()
            })
        }
    })

    // Handle messages from the webview
    const receiveMessageDisposable = panel.webview.onDidReceiveMessage((message: messageObject) => {
        switch (message.command) {
            case 'updateResult':
                logger.debug(message.text)
                if (message.error) {
                    logger.error(message.error)
                }
                break
            case 'webviewRendered':
                // Webview has finished rendering, so now we can give it our
                // initial state machine definition.
                panel.webview.postMessage({
                    command: 'update',
                    stateMachineData: documentText
                })
                break
        }
    })

    // When the panel is closed, dispose of any disposables/remove subscriptions
    panel.onDidDispose(() => {
        updateOnSaveDisposable.dispose()
        receiveMessageDisposable.dispose()
    })

    return panel
}

function makeWebviewTitle(sourceDocumentUri: vscode.Uri): string {
    return localize('AWS.stepFunctions.graph.titlePrefix', 'Graph: {0}', path.basename(sourceDocumentUri.fsPath))
}

function getWebviewContent(
    graphStateMachineScriptPath: vscode.Uri,
    graphStateMachineScriptPath2: vscode.Uri,
    graphStateMachineCSS: vscode.Uri
): string {
    return `
	 <!DOCTYPE html>
	 <html>
	     <head>
	         <meta charset="UTF-8">
	         <link rel="stylesheet" href='${graphStateMachineCSS}'>
             <script src='${graphStateMachineScriptPath2}'></script>
	     </head>
	     <body>
	         <div id="svgcontainer" class="workflowgraph" style="background-color: white;">
	             <svg></svg>
	         </div>

	         <script src='${graphStateMachineScriptPath}'></script>
	     </body>
	 </html>`
}
