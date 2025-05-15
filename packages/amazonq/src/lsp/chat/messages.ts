/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    isValidAuthFollowUpType,
    INSERT_TO_CURSOR_POSITION,
    AUTH_FOLLOW_UP_CLICKED,
    CHAT_OPTIONS,
    COPY_TO_CLIPBOARD,
    AuthFollowUpType,
    DISCLAIMER_ACKNOWLEDGED,
    UiMessageResultParams,
    CHAT_PROMPT_OPTION_ACKNOWLEDGED,
    ChatPromptOptionAcknowledgedMessage,
    STOP_CHAT_RESPONSE,
    StopChatResponseMessage,
} from '@aws/chat-client-ui-types'
import {
    ChatResult,
    chatRequestType,
    ChatParams,
    followUpClickNotificationType,
    quickActionRequestType,
    QuickActionResult,
    QuickActionParams,
    insertToCursorPositionNotificationType,
    ErrorCodes,
    ResponseError,
    openTabRequestType,
    getSerializedChatRequestType,
    listConversationsRequestType,
    conversationClickRequestType,
    listMcpServersRequestType,
    mcpServerClickRequestType,
    ShowSaveFileDialogRequestType,
    ShowSaveFileDialogParams,
    LSPErrorCodes,
    tabBarActionRequestType,
    ShowDocumentParams,
    ShowDocumentResult,
    ShowDocumentRequest,
    contextCommandsNotificationType,
    ContextCommandParams,
    openFileDiffNotificationType,
    OpenFileDiffParams,
    LINK_CLICK_NOTIFICATION_METHOD,
    LinkClickParams,
    INFO_LINK_CLICK_NOTIFICATION_METHOD,
    buttonClickRequestType,
    ButtonClickResult,
    CancellationTokenSource,
    chatUpdateNotificationType,
    ChatUpdateParams,
} from '@aws/language-server-runtimes/protocol'
import { v4 as uuidv4 } from 'uuid'
import * as vscode from 'vscode'
import { Disposable, LanguageClient, Position, TextDocumentIdentifier } from 'vscode-languageclient'
import { AmazonQChatViewProvider } from './webviewProvider'
import { AuthUtil, CodeWhispererSettings, ReferenceLogViewProvider } from 'aws-core-vscode/codewhisperer'
import { amazonQDiffScheme, AmazonQPromptSettings, messages, openUrl } from 'aws-core-vscode/shared'
import {
    DefaultAmazonQAppInitContext,
    messageDispatcher,
    EditorContentController,
    ViewDiffMessage,
    referenceLogText,
} from 'aws-core-vscode/amazonq'
import { telemetry, TelemetryBase } from 'aws-core-vscode/telemetry'
import { isValidResponseError } from './error'
import { decryptResponse, encryptRequest } from '../encryption'
import { getCursorState } from '../utils'

export function registerLanguageServerEventListener(languageClient: LanguageClient, provider: AmazonQChatViewProvider) {
    languageClient.info(
        'Language client received initializeResult from server:',
        JSON.stringify(languageClient.initializeResult)
    )

    const chatOptions = languageClient.initializeResult?.awsServerCapabilities?.chatOptions

    // overide the quick action commands provided by flare server initialization, which doesn't provide the group header
    if (chatOptions?.quickActions?.quickActionsCommandGroups?.[0]) {
        chatOptions.quickActions.quickActionsCommandGroups[0].groupName = 'Quick Actions'
    }

    provider.onDidResolveWebview(() => {
        void provider.webview?.postMessage({
            command: CHAT_OPTIONS,
            params: chatOptions,
        })
    })

    // This passes through metric data from LSP events to Toolkit telemetry with all fields from the LSP server
    languageClient.onTelemetry((e) => {
        const telemetryName: string = e.name

        if (telemetryName in telemetry) {
            switch (telemetryName) {
                case 'codewhisperer_serviceInvocation': {
                    // this feature is entirely client side right now
                    e.data.codewhispererImportRecommendationEnabled =
                        CodeWhispererSettings.instance.isImportRecommendationEnabled()
                    break
                }
            }
            languageClient.info(`[Telemetry] Emitting ${telemetryName} telemetry: ${JSON.stringify(e.data)}`)
            telemetry[telemetryName as keyof TelemetryBase].emit(e.data)
        }
    })
}

export function registerMessageListeners(
    languageClient: LanguageClient,
    provider: AmazonQChatViewProvider,
    encryptionKey: Buffer
) {
    const chatStreamTokens = new Map<string, CancellationTokenSource>() // tab id -> token
    provider.webview?.onDidReceiveMessage(async (message) => {
        languageClient.info(`[VSCode Client]  Received ${JSON.stringify(message)} from chat`)

        if ((message.tabType && message.tabType !== 'cwc') || messageDispatcher.isLegacyEvent(message.command)) {
            // handle the mynah ui -> agent legacy flow
            messageDispatcher.handleWebviewEvent(
                message,
                DefaultAmazonQAppInitContext.instance.getWebViewToAppsMessagePublishers()
            )
            return
        }

        const webview = provider.webview
        switch (message.command) {
            case COPY_TO_CLIPBOARD:
                languageClient.info('[VSCode Client] Copy to clipboard event received')
                try {
                    await messages.copyToClipboard(message.params.code)
                } catch (e) {
                    languageClient.error(`[VSCode Client] Failed to copy to clipboard: ${(e as Error).message}`)
                }
                break
            case INSERT_TO_CURSOR_POSITION: {
                const editor = vscode.window.activeTextEditor
                let textDocument: TextDocumentIdentifier | undefined = undefined
                let cursorPosition: Position | undefined = undefined
                if (editor) {
                    cursorPosition = editor.selection.active
                    textDocument = { uri: editor.document.uri.toString() }
                }

                languageClient.sendNotification(insertToCursorPositionNotificationType.method, {
                    ...message.params,
                    cursorPosition,
                    textDocument,
                })
                break
            }
            case AUTH_FOLLOW_UP_CLICKED: {
                languageClient.info('[VSCode Client] AuthFollowUp clicked')
                const authType = message.params.authFollowupType
                const reAuthTypes: AuthFollowUpType[] = ['re-auth', 'missing_scopes']
                const fullAuthTypes: AuthFollowUpType[] = ['full-auth', 'use-supported-auth']

                if (reAuthTypes.includes(authType)) {
                    try {
                        await AuthUtil.instance.reauthenticate()
                    } catch (e) {
                        languageClient.error(
                            `[VSCode Client] Failed to re-authenticate after AUTH_FOLLOW_UP_CLICKED: ${(e as Error).message}`
                        )
                    }
                }

                if (fullAuthTypes.includes(authType)) {
                    try {
                        await AuthUtil.instance.secondaryAuth.deleteConnection()
                    } catch (e) {
                        languageClient.error(
                            `[VSCode Client] Failed to authenticate after AUTH_FOLLOW_UP_CLICKED: ${(e as Error).message}`
                        )
                    }
                }
                break
            }
            case DISCLAIMER_ACKNOWLEDGED: {
                void AmazonQPromptSettings.instance.update('amazonQChatDisclaimer', true)
                break
            }
            case CHAT_PROMPT_OPTION_ACKNOWLEDGED: {
                const acknowledgedMessage = message as ChatPromptOptionAcknowledgedMessage
                switch (acknowledgedMessage.params.messageId) {
                    case 'programmerModeCardId': {
                        void AmazonQPromptSettings.instance.disablePrompt('amazonQChatPairProgramming')
                    }
                }
                break
            }
            case INFO_LINK_CLICK_NOTIFICATION_METHOD:
            case LINK_CLICK_NOTIFICATION_METHOD: {
                const linkParams = message.params as LinkClickParams
                void openUrl(vscode.Uri.parse(linkParams.link))
                break
            }
            case STOP_CHAT_RESPONSE: {
                const tabId = (message as StopChatResponseMessage).params.tabId
                const token = chatStreamTokens.get(tabId)
                token?.cancel()
                token?.dispose()
                chatStreamTokens.delete(tabId)
                break
            }
            case chatRequestType.method: {
                const chatParams: ChatParams = { ...message.params }
                const partialResultToken = uuidv4()
                let lastPartialResult: ChatResult | undefined
                const cancellationToken = new CancellationTokenSource()
                chatStreamTokens.set(chatParams.tabId, cancellationToken)

                const chatDisposable = languageClient.onProgress(chatRequestType, partialResultToken, (partialResult) =>
                    handlePartialResult<ChatResult>(partialResult, encryptionKey, provider, chatParams.tabId).then(
                        (result) => {
                            lastPartialResult = result
                        }
                    )
                )

                const editor =
                    vscode.window.activeTextEditor ||
                    vscode.window.visibleTextEditors.find((editor) => editor.document.languageId !== 'Log')
                if (editor) {
                    chatParams.cursorState = getCursorState(editor.selections)
                    chatParams.textDocument = { uri: editor.document.uri.toString() }
                }

                const chatRequest = await encryptRequest<ChatParams>(chatParams, encryptionKey)
                try {
                    const chatResult = await languageClient.sendRequest<string | ChatResult>(
                        chatRequestType.method,
                        {
                            ...chatRequest,
                            partialResultToken,
                        },
                        cancellationToken.token
                    )
                    await handleCompleteResult<ChatResult>(
                        chatResult,
                        encryptionKey,
                        provider,
                        chatParams.tabId,
                        chatDisposable
                    )
                } catch (e) {
                    const errorMsg = `Error occurred during chat request: ${e}`
                    languageClient.info(errorMsg)
                    languageClient.info(
                        `Last result from langauge server: ${JSON.stringify(lastPartialResult, undefined, 2)}`
                    )
                    if (!isValidResponseError(e)) {
                        throw e
                    }
                    await handleCompleteResult<ChatResult>(
                        e.data,
                        encryptionKey,
                        provider,
                        chatParams.tabId,
                        chatDisposable
                    )
                } finally {
                    chatStreamTokens.delete(chatParams.tabId)
                }
                break
            }
            case quickActionRequestType.method: {
                const quickActionPartialResultToken = uuidv4()
                const quickActionDisposable = languageClient.onProgress(
                    quickActionRequestType,
                    quickActionPartialResultToken,
                    (partialResult) =>
                        handlePartialResult<QuickActionResult>(
                            partialResult,
                            encryptionKey,
                            provider,
                            message.params.tabId
                        )
                )

                const quickActionRequest = await encryptRequest<QuickActionParams>(message.params, encryptionKey)
                const quickActionResult = (await languageClient.sendRequest(quickActionRequestType.method, {
                    ...quickActionRequest,
                    partialResultToken: quickActionPartialResultToken,
                })) as string | ChatResult
                void handleCompleteResult<ChatResult>(
                    quickActionResult,
                    encryptionKey,
                    provider,
                    message.params.tabId,
                    quickActionDisposable
                )
                break
            }
            case listConversationsRequestType.method:
            case conversationClickRequestType.method:
            case listMcpServersRequestType.method:
            case mcpServerClickRequestType.method:
            case tabBarActionRequestType.method:
                await resolveChatResponse(message.command, message.params, languageClient, webview)
                break
            case followUpClickNotificationType.method:
                if (!isValidAuthFollowUpType(message.params.followUp.type)) {
                    languageClient.sendNotification(followUpClickNotificationType.method, message.params)
                }
                break
            case buttonClickRequestType.method: {
                const buttonResult = await languageClient.sendRequest<ButtonClickResult>(
                    buttonClickRequestType.method,
                    message.params
                )
                if (!buttonResult.success) {
                    languageClient.error(
                        `[VSCode Client] Failed to execute action associated with button with reason: ${buttonResult.failureReason}`
                    )
                }
                break
            }
            default:
                if (isServerEvent(message.command)) {
                    languageClient.sendNotification(message.command, message.params)
                }
                break
        }
    }, undefined)

    const registerHandlerWithResponseRouter = (command: string) => {
        const handler = async (params: any, _: any) => {
            const mapErrorType = (type: string | undefined): number => {
                switch (type) {
                    case 'InvalidRequest':
                        return ErrorCodes.InvalidRequest
                    case 'InternalError':
                        return ErrorCodes.InternalError
                    case 'UnknownError':
                    default:
                        return ErrorCodes.UnknownErrorCode
                }
            }
            const requestId = uuidv4()

            void provider.webview?.postMessage({
                requestId: requestId,
                command: command,
                params: params,
            })
            const responsePromise = new Promise<UiMessageResultParams | undefined>((resolve, reject) => {
                const timeout = setTimeout(() => {
                    disposable?.dispose()
                    reject(new Error('Request timed out'))
                }, 30000)

                const disposable = provider.webview?.onDidReceiveMessage((message: any) => {
                    if (message.requestId === requestId) {
                        clearTimeout(timeout)
                        disposable?.dispose()
                        resolve(message.params)
                    }
                })
            })

            const result = await responsePromise

            if (result?.success) {
                return result.result
            } else {
                return new ResponseError(
                    mapErrorType(result?.error.type),
                    result?.error.message ?? 'No response from client'
                )
            }
        }

        languageClient.onRequest(command, handler)
    }

    registerHandlerWithResponseRouter(openTabRequestType.method)
    registerHandlerWithResponseRouter(getSerializedChatRequestType.method)

    languageClient.onRequest(ShowSaveFileDialogRequestType.method, async (params: ShowSaveFileDialogParams) => {
        const filters: Record<string, string[]> = {}
        const formatMappings = [
            { format: 'markdown', key: 'Markdown', extensions: ['md'] },
            { format: 'html', key: 'HTML', extensions: ['html'] },
        ]

        for (const format of params.supportedFormats ?? []) {
            const mapping = formatMappings.find((m) => m.format === format)
            if (mapping) {
                filters[mapping.key] = mapping.extensions
            }
        }

        const saveAtUri = params.defaultUri ? vscode.Uri.parse(params.defaultUri) : vscode.Uri.file('export-chat.md')
        const targetUri = await vscode.window.showSaveDialog({
            filters,
            defaultUri: saveAtUri,
            title: 'Export',
        })

        if (!targetUri) {
            return new ResponseError(LSPErrorCodes.RequestFailed, 'Export failed')
        }

        return {
            targetUri: targetUri.toString(),
        }
    })

    languageClient.onRequest<ShowDocumentParams, ShowDocumentResult>(
        ShowDocumentRequest.method,
        async (params: ShowDocumentParams): Promise<ShowDocumentParams | ResponseError<ShowDocumentResult>> => {
            try {
                const uri = vscode.Uri.parse(params.uri)
                const doc = await vscode.workspace.openTextDocument(uri)
                await vscode.window.showTextDocument(doc, { preview: false })
                return params
            } catch (e) {
                return new ResponseError(
                    LSPErrorCodes.RequestFailed,
                    `Failed to open document: ${(e as Error).message}`
                )
            }
        }
    )

    languageClient.onNotification(contextCommandsNotificationType.method, (params: ContextCommandParams) => {
        void provider.webview?.postMessage({
            command: contextCommandsNotificationType.method,
            params: params,
        })
    })

    languageClient.onNotification(openFileDiffNotificationType.method, async (params: OpenFileDiffParams) => {
        const ecc = new EditorContentController()
        const uri = params.originalFileUri
        const doc = await vscode.workspace.openTextDocument(uri)
        const entireDocumentSelection = new vscode.Selection(
            new vscode.Position(0, 0),
            new vscode.Position(doc.lineCount - 1, doc.lineAt(doc.lineCount - 1).text.length)
        )
        const viewDiffMessage: ViewDiffMessage = {
            context: {
                activeFileContext: {
                    filePath: params.originalFileUri,
                    fileText: params.originalFileContent ?? '',
                    fileLanguage: undefined,
                    matchPolicy: undefined,
                },
                focusAreaContext: {
                    selectionInsideExtendedCodeBlock: entireDocumentSelection,
                    codeBlock: '',
                    extendedCodeBlock: '',
                    names: undefined,
                },
            },
            code: params.fileContent ?? '',
        }
        await ecc.viewDiff(viewDiffMessage, amazonQDiffScheme)
    })

    languageClient.onNotification(chatUpdateNotificationType.method, (params: ChatUpdateParams) => {
        void provider.webview?.postMessage({
            command: chatUpdateNotificationType.method,
            params: params,
        })
    })
}

function isServerEvent(command: string) {
    return command.startsWith('aws/chat/') || command === 'telemetry/event'
}

/**
 * Decodes partial chat responses from the language server before sending them to mynah UI
 */
async function handlePartialResult<T extends ChatResult>(
    partialResult: string | T,
    encryptionKey: Buffer | undefined,
    provider: AmazonQChatViewProvider,
    tabId: string
) {
    const decryptedMessage = await decryptResponse<T>(partialResult, encryptionKey)

    if (decryptedMessage.body !== undefined) {
        void provider.webview?.postMessage({
            command: chatRequestType.method,
            params: decryptedMessage,
            isPartialResult: true,
            tabId: tabId,
        })
    }
    return decryptedMessage
}

/**
 * Decodes the final chat responses from the language server before sending it to mynah UI.
 * Once this is called the answer response is finished
 */
async function handleCompleteResult<T extends ChatResult>(
    result: string | T,
    encryptionKey: Buffer | undefined,
    provider: AmazonQChatViewProvider,
    tabId: string,
    disposable: Disposable
) {
    const decryptedMessage = await decryptResponse<T>(result, encryptionKey)

    void provider.webview?.postMessage({
        command: chatRequestType.method,
        params: decryptedMessage,
        tabId: tabId,
    })

    // only add the reference log once the request is complete, otherwise we will get duplicate log items
    for (const ref of decryptedMessage.codeReference ?? []) {
        ReferenceLogViewProvider.instance.addReferenceLog(referenceLogText(ref))
    }
    disposable.dispose()
}

async function resolveChatResponse(
    requestMethod: string,
    params: any,
    languageClient: LanguageClient,
    webview: vscode.Webview | undefined
) {
    const result = await languageClient.sendRequest(requestMethod, params)
    void webview?.postMessage({
        command: requestMethod,
        params: result,
    })
}
