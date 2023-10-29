/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'

export type InitRequest = {
    command: 'INIT'
}
export type LoadFileRequest = {
    command: 'LOAD_FILE'
    filePath: string
}
export type SaveFileRequest = {
    command: 'SAVE_FILE'
    filePath: string
    fileContents: string
}
export type NotifyUserRequest = {
    command: 'NOTIFY_USER'
    notification: string
    notificationType: 'INFO' | 'WARNING' | 'ERROR'
}
export type UndoRequest = {
    command: 'UNDO'
    filePath: string
}
export type RedoRequest = {
    command: 'REDO'
    filePath: string
}
export type SyncRequest = {
    command: 'SYNC'
}

export type Command =
    | InitRequest
    | LoadFileRequest
    | SaveFileRequest
    | NotifyUserRequest
    | UndoRequest
    | RedoRequest
    | SyncRequest

export type WebviewContext = {
    panel: vscode.WebviewPanel
    textDocument: vscode.TextDocument
}

export async function handleCommand(command: Command, context: WebviewContext) {
    switch (command.command) {
        case 'INIT':
            context.panel.webview.postMessage({
                response: 'INIT',
                templatePath: context.textDocument.fileName,
            })
            break
        case 'LOAD_FILE':
            await loadFile()
            break
        case 'SAVE_FILE':
            saveFile()
            break
        case 'NOTIFY_USER':
            notifyUser()
            return
        default:
            vscode.window.showInformationMessage(command.toString())
            return
    }

    async function loadFile() {
        if (command.command !== 'LOAD_FILE') {
            return
        }
        let fileContents: string = ''
        if (command.filePath === '') {
            fileContents = context.textDocument.getText()
        } else {
            vscode.window.showInformationMessage(command.filePath)
            try {
                fileContents = (await vscode.workspace.fs.readFile(vscode.Uri.file(command.filePath))).toString()
            } catch (exception) {
                context.panel.webview.postMessage({
                    response: 'LOAD_FILE',
                    filePath: command.filePath,
                    status: 'FAILED',
                    error: exception,
                })
                return
            }
        }
        context.panel.webview.postMessage({
            response: 'LOAD_FILE',
            filePath: command.filePath,
            status: 'SUCCEEDED',
            fileContents: fileContents,
        })
    }

    function saveFile() {
        if (command.command !== 'SAVE_FILE') {
            return
        }
        if (command.filePath === '') {
            if (!context.textDocument.isDirty) {
                const content = Buffer.from(command.fileContents, 'utf8')
                try {
                    vscode.workspace.fs.writeFile(context.textDocument.uri, content)
                } catch (exception) {
                    context.panel.webview.postMessage({
                        response: 'SAVE_FILE',
                        filePath: command.filePath,
                        status: 'FAILED',
                        error: exception,
                    })
                    return
                }
            } else {
                vscode.window.showWarningMessage(
                    'Application Composer is unable to save your template as there are unsaved external changes. Please save or undo them.'
                )
                context.panel.webview.postMessage({
                    response: 'SAVE_FILE',
                    filePath: command.filePath,
                    status: 'FAILED',
                    error: 'Unsaved user changes',
                })
                return
            }
        } else {
            // TODO: Check if open & dirty for external files too
            const content = Buffer.from(command.fileContents, 'utf8')
            const uri = vscode.Uri.file(command.filePath)
            try {
                vscode.workspace.fs.writeFile(uri, content)
            } catch (exception) {
                context.panel.webview.postMessage({
                    response: 'SAVE_FILE',
                    filePath: command.filePath,
                    status: 'FAILED',
                    error: exception,
                })
                return
            }
        }
        context.panel.webview.postMessage({
            response: 'SAVE_FILE',
            filePath: command.filePath,
            status: 'SUCCEEDED',
        })
    }

    function notifyUser() {
        if (command.command !== 'NOTIFY_USER') {
            return
        }
        if (command.notificationType === 'ERROR') {
            vscode.window.showErrorMessage(command.notification)
        } else if (command.notificationType === 'WARNING') {
            vscode.window.showWarningMessage(command.notification)
        } else {
            vscode.window.showInformationMessage(command.notification)
        }
    }
}
