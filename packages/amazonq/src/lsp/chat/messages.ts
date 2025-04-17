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
    ShowSaveFileDialogRequestType,
    ShowSaveFileDialogParams,
    LSPErrorCodes,
    tabBarActionRequestType,
    ShowDocumentParams,
    ShowDocumentResult,
    ShowDocumentRequest,
    contextCommandsNotificationType,
    ContextCommandParams,
} from '@aws/language-server-runtimes/protocol'
import { v4 as uuidv4 } from 'uuid'
import * as vscode from 'vscode'
import { Disposable, LanguageClient, Position, TextDocumentIdentifier } from 'vscode-languageclient'
import * as jose from 'jose'
import { AmazonQChatViewProvider } from './webviewProvider'
import { AuthUtil } from 'aws-core-vscode/codewhisperer'
import { AmazonQPromptSettings, messages } from 'aws-core-vscode/shared'

export function registerLanguageServerEventListener(languageClient: LanguageClient, provider: AmazonQChatViewProvider) {
    languageClient.info(
        'Language client received initializeResult from server:',
        JSON.stringify(languageClient.initializeResult)
    )

    const chatOptions = languageClient.initializeResult?.awsServerCapabilities?.chatOptions

    // Enable the history/export feature flags
    chatOptions.history = true
    chatOptions.export = true

    provider.onDidResolveWebview(() => {
        void provider.webview?.postMessage({
            command: CHAT_OPTIONS,
            params: chatOptions,
        })
    })

    languageClient.onTelemetry((e) => {
        languageClient.info(`[VSCode Client] Received telemetry event from server ${JSON.stringify(e)}`)
    })
}

export function registerMessageListeners(
    languageClient: LanguageClient,
    provider: AmazonQChatViewProvider,
    encryptionKey: Buffer
) {
    provider.webview?.onDidReceiveMessage(async (message) => {
        languageClient.info(`[VSCode Client]  Received ${JSON.stringify(message)} from chat`)

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
                void AmazonQPromptSettings.instance.disablePrompt('amazonQChatDisclaimer')
                break
            }
            case chatRequestType.method: {
                const partialResultToken = uuidv4()
                const chatDisposable = languageClient.onProgress(chatRequestType, partialResultToken, (partialResult) =>
                    handlePartialResult<ChatResult>(partialResult, encryptionKey, provider, message.params.tabId)
                )

                const editor =
                    vscode.window.activeTextEditor ||
                    vscode.window.visibleTextEditors.find((editor) => editor.document.languageId !== 'Log')
                if (editor) {
                    message.params.cursorPosition = [editor.selection.active]
                    message.params.textDocument = { uri: editor.document.uri.toString() }
                }

                const chatRequest = await encryptRequest<ChatParams>(message.params, encryptionKey)
                const chatResult = (await languageClient.sendRequest(chatRequestType.method, {
                    ...chatRequest,
                    partialResultToken,
                })) as string | ChatResult
                void handleCompleteResult<ChatResult>(
                    chatResult,
                    encryptionKey,
                    provider,
                    message.params.tabId,
                    chatDisposable
                )
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
            case tabBarActionRequestType.method:
                await resolveChatResponse(message.command, message.params, languageClient, webview)
                break
            case followUpClickNotificationType.method:
                if (!isValidAuthFollowUpType(message.params.followUp.type)) {
                    languageClient.sendNotification(followUpClickNotificationType.method, message.params)
                }
                break
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
            const uri = vscode.Uri.parse(params.uri)
            const doc = await vscode.workspace.openTextDocument(uri)
            await vscode.window.showTextDocument(doc, { preview: false })
            return params
        }
    )

    languageClient.onNotification(contextCommandsNotificationType.method, (params: ContextCommandParams) => {
        void provider.webview?.postMessage({
            command: contextCommandsNotificationType.method,
            params: params,
        })
    })
}

function isServerEvent(command: string) {
    return command.startsWith('aws/chat/') || command === 'telemetry/event'
}

async function encryptRequest<T>(params: T, encryptionKey: Buffer): Promise<{ message: string } | T> {
    const payload = new TextEncoder().encode(JSON.stringify(params))

    const encryptedMessage = await new jose.CompactEncrypt(payload)
        .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
        .encrypt(encryptionKey)

    return { message: encryptedMessage }
}

async function decodeRequest<T>(request: string, key: Buffer): Promise<T> {
    const result = await jose.jwtDecrypt(request, key, {
        clockTolerance: 60, // Allow up to 60 seconds to account for clock differences
        contentEncryptionAlgorithms: ['A256GCM'],
        keyManagementAlgorithms: ['dir'],
    })

    if (!result.payload) {
        throw new Error('JWT payload not found')
    }
    return result.payload as T
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
    const decryptedMessage =
        typeof partialResult === 'string' && encryptionKey
            ? await decodeRequest<T>(partialResult, encryptionKey)
            : (partialResult as T)

    if (decryptedMessage.body) {
        void provider.webview?.postMessage({
            command: chatRequestType.method,
            params: decryptedMessage,
            isPartialResult: true,
            tabId: tabId,
        })
    }
}

/**
 * Decodes the final chat responses from the language server before sending it to mynah UI.
 * Once this is called the answer response is finished
 */
async function handleCompleteResult<T>(
    result: string | T,
    encryptionKey: Buffer | undefined,
    provider: AmazonQChatViewProvider,
    tabId: string,
    disposable: Disposable
) {
    const decryptedMessage =
        typeof result === 'string' && encryptionKey ? await decodeRequest(result, encryptionKey) : result

    void provider.webview?.postMessage({
        command: chatRequestType.method,
        params: decryptedMessage,
        tabId: tabId,
    })
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
