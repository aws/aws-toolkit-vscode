/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Command,
    Message,
    MessageType,
    SaveFileRequestMessage,
    WebviewContext,
    InitResponseMessage,
    FileChangedMessage,
    FileChangeEventTrigger,
} from './types'
import { submitFeedback } from '../../feedback/vue/submitFeedback'
import { placeholder } from '../../shared/vscode/commands2'
import * as nls from 'vscode-nls'
import vscode from 'vscode'
import { telemetry } from '../../shared/telemetry/telemetry'
import { ToolkitError } from '../../shared/errors'
const localize = nls.loadMessageBundle()

/**
 * Handles messages received from the webview. Depending on the message type and command,
 * calls the appropriate handler function
 * @param message The message received from the webview
 * @param context The context object containing information about the webview environment
 */
export async function handleMessage(message: Message, context: WebviewContext) {
    const { command, messageType } = message

    if (messageType === MessageType.REQUEST) {
        switch (command) {
            case Command.INIT:
                void initMessageHandler(context)
                break
            case Command.SAVE_FILE:
                void saveFileMessageHandler(message as SaveFileRequestMessage, context)
                break
            case Command.AUTO_SAVE_FILE:
                void autoSaveFileMessageHandler(message as SaveFileRequestMessage, context)
                break
            case Command.OPEN_FEEDBACK:
                void submitFeedback(placeholder, 'Workflow Studio')
                break
        }
    } else if (messageType === MessageType.BROADCAST) {
        switch (command) {
            case Command.LOAD_STAGE:
                void loadStageMessageHandler(context)
                break
        }
    }
}

/**
 * Handler for when the webview is ready.
 * This handler is used to initialize the webview with the contents of the asl file selected.
 * @param context The context object containing the necessary information for the webview.
 */
async function initMessageHandler(context: WebviewContext) {
    const filePath = context.defaultTemplatePath

    try {
        const fileContents = context.textDocument.getText().toString()
        context.fileStates[filePath] = { fileContents }

        await broadcastFileChange(context, 'INITIAL_RENDER')
        context.loaderNotification?.progress.report({ increment: 25 })
    } catch (e) {
        await context.panel.webview.postMessage({
            messageType: MessageType.RESPONSE,
            command: Command.INIT,
            filePath,
            isSuccess: false,
            failureReason: (e as Error).message,
        } as InitResponseMessage)
    }
}

/**
 * Helper Function to broadcast the local file change to the Workflow Studio view
 * @param context: The context of the webview
 * @param trigger: The action that triggered the change (either initial render or user saving the file)
 */
export async function broadcastFileChange(context: WebviewContext, trigger: FileChangeEventTrigger) {
    await context.panel.webview.postMessage({
        messageType: MessageType.BROADCAST,
        command: Command.FILE_CHANGED,
        fileName: context.defaultTemplateName,
        fileContents: context.textDocument.getText().toString(),
        filePath: context.defaultTemplatePath,
        trigger,
    } as FileChangedMessage)
}

/**
 * Handler for managing webview stage load, which updates load notifications.
 * @param message The message containing the load stage.
 * @param context The context object containing the necessary information for the webview.
 */
async function loadStageMessageHandler(context: WebviewContext) {
    context.loaderNotification?.progress.report({ increment: 25 })
    setTimeout(() => {
        context.loaderNotification?.resolve()
    }, 100)
}

/**
 * Handler for saving a file from the webview which updates the workspace and saves the file.
 * Triggered when the user explicitly applies save action in WFS
 * @param request The request message containing the file contents.
 * @param context The webview context containing the necessary information for saving the file.
 */
async function saveFileMessageHandler(request: SaveFileRequestMessage, context: WebviewContext) {
    await telemetry.stepfunctions_saveFile.run(async (span) => {
        span.record({
            id: context.fileId,
            saveType: 'MANUAL_SAVE',
            source: 'WORKFLOW_STUDIO',
        })

        try {
            await saveWorkspace(context, request.fileContents)
            await context.textDocument.save()

            void vscode.window.showInformationMessage(
                localize(
                    'AWS.stepFunctions.workflowStudio.actions.saveSuccessMessage',
                    '{0} has been saved',
                    context.defaultTemplateName
                )
            )
        } catch (err) {
            throw ToolkitError.chain(err, 'Could not save asl file.', { code: 'SaveFailed' })
        }
    })
}

/**
 * Handler for auto saving a file from the webview which updates the workspace but does not save the file.
 * Triggered on every code change from WFS.
 * @param request The request message containing the file contents.
 * @param context The webview context containing the necessary information for saving the file.
 */
async function autoSaveFileMessageHandler(request: SaveFileRequestMessage, context: WebviewContext) {
    await telemetry.stepfunctions_saveFile.run(async (span) => {
        span.record({
            id: context.fileId,
            saveType: 'AUTO_SAVE',
            source: 'WORKFLOW_STUDIO',
        })

        try {
            await saveWorkspace(context, request.fileContents)
        } catch (err) {
            throw ToolkitError.chain(err, 'Could not autosave asl file.', { code: 'AutoSaveFailed' })
        }
    })
}

/**
 * Saves to the workspace with the provided file contents.
 * @param context The webview context containing the necessary information for saving the file.
 * @param fileContents The file contents to save.
 */
async function saveWorkspace(context: WebviewContext, fileContents: string) {
    const edit = new vscode.WorkspaceEdit()
    edit.replace(context.textDocument.uri, new vscode.Range(0, 0, context.textDocument.lineCount, 0), fileContents)
    await vscode.workspace.applyEdit(edit)
}
