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
    SyncFileRequestMessage,
    ApiCallRequestMessage,
    UnsupportedMessage,
    WorkflowMode,
} from './types'
import { submitFeedback } from '../../feedback/vue/submitFeedback'
import { placeholder } from '../../shared/vscode/commands2'
import * as nls from 'vscode-nls'
import vscode from 'vscode'
import { telemetry } from '../../shared/telemetry/telemetry'
import { ToolkitError } from '../../shared/errors'
import { WorkflowStudioApiHandler } from './workflowStudioApiHandler'
import globals from '../../shared/extensionGlobals'
import { getLogger } from '../../shared/logger/logger'
import { publishStateMachine } from '../commands/publishStateMachine'
import {
    getStateMachineDefinitionFromCfnTemplate,
    toUnescapedAslJsonString,
} from '../commands/visualizeStateMachine/getStateMachineDefinitionFromCfnTemplate'

const localize = nls.loadMessageBundle()

/**
 * Handles messages received from the webview. Depending on the message type and command,
 * calls the appropriate handler function
 * @param message The message received from the webview
 * @param context The context object containing information about the webview environment
 */
export async function handleMessage(message: Message, context: WebviewContext) {
    const { command, messageType } = message
    const isReadonlyMode = context.mode === WorkflowMode.Readonly
    if (messageType === MessageType.REQUEST) {
        switch (command) {
            case Command.INIT:
                void initMessageHandler(context)
                break
            case Command.SAVE_FILE:
                !isReadonlyMode && void saveFileMessageHandler(message as SaveFileRequestMessage, context)
                break
            case Command.SAVE_FILE_AND_DEPLOY:
                !isReadonlyMode && void saveFileAndDeployMessageHandler(message as SaveFileRequestMessage, context)
                break
            case Command.AUTO_SYNC_FILE:
                !isReadonlyMode && void autoSyncFileMessageHandler(message as SyncFileRequestMessage, context)
                break
            case Command.CLOSE_WFS:
                void closeCustomEditorMessageHandler(context)
                break
            case Command.OPEN_FEEDBACK:
                !isReadonlyMode && void submitFeedback(placeholder, 'Workflow Studio')
                break
            case Command.API_CALL:
                !isReadonlyMode && apiCallMessageHandler(message as ApiCallRequestMessage, context)
                break
            default:
                void handleUnsupportedMessage(context, message)
                break
        }
    } else if (messageType === MessageType.BROADCAST) {
        switch (command) {
            case Command.LOAD_STAGE:
                void loadStageMessageHandler(context)
                break
            default:
                void handleUnsupportedMessage(context, message)
                break
        }
    } else {
        void handleUnsupportedMessage(context, message)
    }
}

/**
 * Method for extracting fileContents from the context object based on different WorkflowStudio modes.
 * @param context The context object containing the necessary information for the webview.
 */
function getFileContents(context: WebviewContext): string {
    const filePath = context.defaultTemplatePath
    if (context.mode === WorkflowMode.Readonly) {
        const definitionString = getStateMachineDefinitionFromCfnTemplate(context.stateMachineName, filePath)
        return toUnescapedAslJsonString(definitionString || '')
    } else {
        return context.textDocument.getText().toString()
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
        const fileContents = getFileContents(context)
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
    const fileContents = getFileContents(context)
    await context.panel.webview.postMessage({
        messageType: MessageType.BROADCAST,
        command: Command.FILE_CHANGED,
        fileName:
            context.mode === WorkflowMode.Readonly && context.stateMachineName
                ? context.stateMachineName
                : context.defaultTemplateName,
        fileContents,
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
 * Handler for closing WFS custom editor. When called, disposes webview panel and opens default VSCode editor
 * @param context The context object containing the necessary information for the webview.
 */
export async function closeCustomEditorMessageHandler(context: WebviewContext) {
    await telemetry.stepfunctions_closeWorkflowStudio.run(async (span) => {
        span.record({
            id: context.fileId,
        })
        context.panel.dispose()
        await vscode.commands.executeCommand('vscode.openWith', context.textDocument.uri, 'default')
    })
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
            isInvalidJson: request.isInvalidJson,
        })

        try {
            await context.textDocument.save()
            void vscode.window.showInformationMessage(
                localize(
                    'AWS.stepFunctions.workflowStudio.actions.saveSuccessMessage',
                    '{0} has been saved',
                    context.defaultTemplateName
                )
            )
        } catch (err) {
            throw ToolkitError.chain(err, 'Could not save asl file.', {
                code: 'SaveFailed',
            })
        }
    })
}

/**
 * Handler for saving a file and starting the state machine deployment flow, while also switching to default editor.
 * Triggered when the user triggers 'Save and Deploy' action in WFS
 * @param request The request message containing the file contents.
 * @param context The webview context containing the necessary information for saving the file.
 */
async function saveFileAndDeployMessageHandler(request: SaveFileRequestMessage, context: WebviewContext) {
    await saveFileMessageHandler(request, context)
    await closeCustomEditorMessageHandler(context)
    await publishStateMachine(globals.awsContext, globals.outputChannel)
}

/**
 * Handler for auto syncing a file from the webview which updates the workspace but does not save the file.
 * Triggered on every code change from WFS, including invalid JSON.
 * @param request The request message containing the file contents.
 * @param context The webview context containing the necessary information for saving the file.
 */
async function autoSyncFileMessageHandler(request: SyncFileRequestMessage, context: WebviewContext) {
    await telemetry.stepfunctions_saveFile.run(async (span) => {
        span.record({
            id: context.fileId,
            saveType: 'AUTO_SYNC',
            source: 'WORKFLOW_STUDIO',
            isInvalidJson: request.isInvalidJson,
        })

        try {
            const edit = new vscode.WorkspaceEdit()
            edit.replace(
                context.textDocument.uri,
                new vscode.Range(0, 0, context.textDocument.lineCount, 0),
                request.fileContents
            )
            await vscode.workspace.applyEdit(edit)
        } catch (err) {
            throw ToolkitError.chain(err, 'Could not autosave asl file.', {
                code: 'AutoSaveFailed',
            })
        }
    })
}

/**
 * Handler for making API calls from the webview and returning the response.
 * @param request The request message containing the API to call and the parameters
 * @param context The webview context used for returning the API response to the webview
 */
function apiCallMessageHandler(request: ApiCallRequestMessage, context: WebviewContext) {
    const logger = getLogger('stepfunctions')
    const apiHandler = new WorkflowStudioApiHandler(globals.awsContext.getCredentialDefaultRegion(), context)
    apiHandler.performApiCall(request).catch((error) => logger.error('%s API call failed: %O', request.apiName, error))
}

/**
 * Handles unsupported or unrecognized messages by sending a response to the webview. Ensures compatibility with future
 * commands and message types, preventing issues if the user has an outdated extension version.
 * @param context The context object containing information about the webview environment
 * @param command The command received from the webview
 * @param messageType The type of the message received
 */
async function handleUnsupportedMessage(context: WebviewContext, originalMessage: Message) {
    await context.panel.webview.postMessage({
        messageType: MessageType.RESPONSE,
        command: Command.UNSUPPORTED_COMMAND,
        originalMessage,
    } as UnsupportedMessage)
}
