/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { debounce } from 'lodash'
import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as path from 'path'
import * as vscode from 'vscode'
import { ext } from '../../shared/extensionGlobals'
import { getLogger, Logger } from '../../shared/logger'
import StateMachineGraphCache from '../utils'

export interface messageObject {
    command: string
    text: string
    error?: string
    stateMachineData: string
}

// TO DO: once the amazon-states-language-service is open sourced
// it should be used directly here - diagnostics appear with a delay
// and an invalid states machine still can be rendered
function isDocumentValid(uri: vscode.Uri): boolean {
    return !vscode.languages
        .getDiagnostics(uri)
        .some(diagnostic => diagnostic.severity === vscode.DiagnosticSeverity.Error)
}

/**
 * Graphs the state machine defined in the current active editor
 */
export async function visualizeStateMachine(globalStorage: vscode.Memento): Promise<vscode.WebviewPanel | void> {
    const logger: Logger = getLogger()
    const cache = new StateMachineGraphCache()

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

    try {
        await cache.updateCache(globalStorage)

        return setupWebviewPanel(documentUri, documentText)
    } catch (err) {
        vscode.window.showInformationMessage(
            localize(
                'AWS.stepfunctions.visualisation.errors.rendering',
                'There was an error rendering State Machine Graph, check logs for details.'
            )
        )

        logger.debug('Unable to setup webview panel.')
        logger.error(err as Error)
    }

    return
}

async function setupWebviewPanel(documentUri: vscode.Uri, documentText: string): Promise<vscode.WebviewPanel> {
    const logger: Logger = getLogger()
    let lastUpdatedTextDocument: vscode.TextDocument

    // Create and show panel
    const panel = vscode.window.createWebviewPanel(
        'stateMachineVisualization',
        makeWebviewTitle(documentUri),
        vscode.ViewColumn.Beside,
        {
            enableScripts: true,
            localResourceRoots: [
                ext.visualizationResourcePaths.localWebviewScriptsPath,
                ext.visualizationResourcePaths.visualizationLibraryCachePath,
                ext.visualizationResourcePaths.stateMachineCustomThemePath
            ],
            retainContextWhenHidden: true
        }
    )

    function sendUpdateMessage(textDocument: vscode.TextDocument) {
        panel.webview.postMessage({
            command: 'update',
            stateMachineData: textDocument.getText(),
            isValid: isDocumentValid(textDocument.uri)
        })
    }

    const debouncedUpdate = debounce(sendUpdateMessage, 500)
    let wasDocumentValid = isDocumentValid(documentUri)

    const interval = setInterval(() => {
        const isValid = isDocumentValid(lastUpdatedTextDocument.uri)

        // Diagnostics are validated with a delay
        // We need to poll them to check if they are updated
        if (isValid && !wasDocumentValid) {
            sendUpdateMessage(lastUpdatedTextDocument)
        }

        wasDocumentValid = isValid
    }, 500)

    // Set the initial html for the webpage
    panel.webview.html = getWebviewContent(
        ext.visualizationResourcePaths.webviewBodyScript.with({ scheme: 'vscode-resource' }),
        ext.visualizationResourcePaths.visualizationLibraryScript.with({ scheme: 'vscode-resource' }),
        ext.visualizationResourcePaths.visualizationLibraryCSS.with({ scheme: 'vscode-resource' }),
        ext.visualizationResourcePaths.stateMachineCustomThemeCSS.with({ scheme: 'vscode-resource' }),
        {
            inSync: localize('AWS.stepFunctions.graph.status.inSync', 'Previewing ASL document. <a>View</a>'),
            notInSync: localize('AWS.stepFunctions.graph.status.notInSync', 'Errors detected. Cannot preview.'),
            syncing: localize('AWS.stepFunctions.graph.status.syncing', 'Rendering ASL graph...')
        }
    )

    // Add listener function to update the graph on document save
    const updateOnSaveDisposable = vscode.workspace.onDidSaveTextDocument(textDocument => {
        if (textDocument && textDocument.uri.path === documentUri.path) {
            const isValid = isDocumentValid(documentUri)
            logger.debug('Sending update message to webview.')

            panel.webview.postMessage({
                command: 'update',
                stateMachineData: textDocument.getText(),
                isValid
            })

            wasDocumentValid = isValid
        }
    })

    const updateOnChangeDisposable = vscode.workspace.onDidChangeTextDocument(textDocument => {
        lastUpdatedTextDocument = textDocument.document
        if (textDocument.document.uri.path === documentUri.path) {
            logger.debug('Sending update message to webview.')
            debouncedUpdate(textDocument.document)
        }
    })

    // Handle messages from the webview
    const receiveMessageDisposable = panel.webview.onDidReceiveMessage(async (message: messageObject) => {
        switch (message.command) {
            case 'updateResult':
                logger.debug(message.text)
                if (message.error) {
                    logger.error(message.error)
                }
                break
            case 'webviewRendered': {
                // Webview has finished rendering, so now we can give it our
                // initial state machine definition.
                const isValid = isDocumentValid(documentUri)
                panel.webview.postMessage({
                    command: 'update',
                    stateMachineData: documentText,
                    isValid
                })

                wasDocumentValid = isValid
                break
            }

            case 'viewDocument':
                try {
                    const document = await vscode.workspace.openTextDocument(documentUri)
                    vscode.window.showTextDocument(document, vscode.ViewColumn.One)
                } catch (e) {
                    logger.error(e as Error)
                }
                break
        }
    })

    // When the panel is closed, dispose of any disposables/remove subscriptions
    panel.onDidDispose(() => {
        updateOnSaveDisposable.dispose()
        updateOnChangeDisposable.dispose()
        receiveMessageDisposable.dispose()
        clearInterval(interval)
    })

    return panel
}

function makeWebviewTitle(sourceDocumentUri: vscode.Uri): string {
    return localize('AWS.stepFunctions.graph.titlePrefix', 'Graph: {0}', path.basename(sourceDocumentUri.fsPath))
}

function getWebviewContent(
    webviewBodyScript: vscode.Uri,
    graphStateMachineLibrary: vscode.Uri,
    vsCodeCustomStyling: vscode.Uri,
    graphStateMachineDefaultStyles: vscode.Uri,
    statusTexts: {
        syncing: string
        notInSync: string
        inSync: string
    }
): string {
    return `
<!DOCTYPE html>
<html>
    <head>
        <meta charset="UTF-8">
        <link rel="stylesheet" href='${graphStateMachineDefaultStyles}'>
        <link rel="stylesheet" href='${vsCodeCustomStyling}'>
        <script src='${graphStateMachineLibrary}'></script>
    </head>

    <body>
        <div id="svgcontainer" class="workflowgraph">
            <svg></svg>
        </div>
        <div class="status-info">
            <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                <circle cx="50" cy="50" r="50"/>
            </svg>
            <div class="status-messages">
                <span class="previewing-asl-message">${statusTexts.inSync}</span>
                <span class="rendering-asl-message">${statusTexts.syncing}</span>
                <span class="error-asl-message">${statusTexts.notInSync}</span>
            </div>
        </div>

        <script src='${webviewBodyScript}'></script>
    </body>
</html>`
}
