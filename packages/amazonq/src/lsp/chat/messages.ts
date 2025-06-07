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
    chatOptionsUpdateType,
    ChatOptionsUpdateParams,
} from '@aws/language-server-runtimes/protocol'
import { v4 as uuidv4 } from 'uuid'
import * as vscode from 'vscode'
import { Disposable, LanguageClient, Position, TextDocumentIdentifier } from 'vscode-languageclient'
import * as jose from 'jose'
import { AmazonQChatViewProvider } from './webviewProvider'
import { AuthUtil, ReferenceLogViewProvider } from 'aws-core-vscode/codewhisperer'
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
import { DiffAnimationHandler } from './diffAnimation/diffAnimationHandler'

// Create a singleton instance of DiffAnimationHandler
let diffAnimationHandler: DiffAnimationHandler | undefined

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
            languageClient.info(`[Telemetry] Emitting ${telemetryName} telemetry: ${JSON.stringify(e.data)}`)
            telemetry[telemetryName as keyof TelemetryBase].emit(e.data)
        }
    })
}

function getCursorState(selection: readonly vscode.Selection[]) {
    return selection.map((s) => ({
        range: {
            start: {
                line: s.start.line,
                character: s.start.character,
            },
            end: {
                line: s.end.line,
                character: s.end.character,
            },
        },
    }))
}

export function registerMessageListeners(
    languageClient: LanguageClient,
    provider: AmazonQChatViewProvider,
    encryptionKey: Buffer
) {
    // Initialize DiffAnimationHandler
    if (!diffAnimationHandler) {
        diffAnimationHandler = new DiffAnimationHandler()
        languageClient.info('[message.ts] 🚀 Initialized DiffAnimationHandler')
    }

    const chatStreamTokens = new Map<string, CancellationTokenSource>() // tab id -> token
    provider.webview?.onDidReceiveMessage(async (message) => {
        languageClient.info(`[VSCode Client] 📨 Received ${JSON.stringify(message)} from chat`)

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

                const chatDisposable = languageClient.onProgress(
                    chatRequestType,
                    partialResultToken,
                    (partialResult) => {
                        // Process partial result with diff animation
                        void handlePartialResult<ChatResult>(
                            partialResult,
                            encryptionKey,
                            provider,
                            chatParams.tabId,
                            languageClient,
                            diffAnimationHandler!
                        )
                            .then((decoded) => {
                                if (decoded) {
                                    lastPartialResult = decoded
                                }
                            })
                            .catch((error) => {
                                languageClient.error(`[message.ts] ❌ Error in partial result handler: ${error}`)
                            })
                    }
                )

                const editor =
                    vscode.window.activeTextEditor ||
                    vscode.window.visibleTextEditors.find((editor) => editor.document.languageId !== 'Log')
                if (editor) {
                    chatParams.cursorState = getCursorState(editor.selections)
                    chatParams.textDocument = { uri: editor.document.uri.toString() }
                }

                const chatRequest = await encryptRequest<ChatParams>(chatParams, encryptionKey)

                // Add timeout monitoring
                const timeoutId = setTimeout(() => {
                    languageClient.warn(
                        `[message.ts] ⚠️ Chat request taking longer than expected for tab ${chatParams.tabId}`
                    )
                }, 30000) // 30 seconds warning

                try {
                    languageClient.info(`[message.ts] 📤 Sending chat request for tab ${chatParams.tabId}`)

                    const chatResult = await languageClient.sendRequest<string | ChatResult>(
                        chatRequestType.method,
                        {
                            ...chatRequest,
                            partialResultToken,
                        },
                        cancellationToken.token
                    )

                    clearTimeout(timeoutId)
                    languageClient.info(`[message.ts] ✅ Received final chat result for tab ${chatParams.tabId}`)

                    await handleCompleteResult<ChatResult>(
                        chatResult,
                        encryptionKey,
                        provider,
                        chatParams.tabId,
                        chatDisposable,
                        languageClient,
                        diffAnimationHandler!
                    )
                } catch (e) {
                    clearTimeout(timeoutId)
                    const errorMsg = `Error occurred during chat request: ${e}`
                    languageClient.error(`[message.ts] ❌ ${errorMsg}`)

                    // Log last partial result for debugging
                    if (lastPartialResult) {
                        languageClient.info(
                            `[message.ts] 📊 Last partial result before error: ${JSON.stringify(lastPartialResult, undefined, 2).substring(0, 500)}...`
                        )
                    }

                    if (!isValidResponseError(e)) {
                        throw e
                    }

                    // Try to handle the error result
                    await handleCompleteResult<ChatResult>(
                        e.data,
                        encryptionKey,
                        provider,
                        chatParams.tabId,
                        chatDisposable,
                        languageClient,
                        diffAnimationHandler!
                    )
                } finally {
                    chatStreamTokens.delete(chatParams.tabId)
                    clearTimeout(timeoutId)
                }
                break
            }
            case quickActionRequestType.method: {
                const quickActionPartialResultToken = uuidv4()
                const quickActionDisposable = languageClient.onProgress(
                    quickActionRequestType,
                    quickActionPartialResultToken,
                    (partialResult) =>
                        void handlePartialResult<QuickActionResult>(
                            partialResult,
                            encryptionKey,
                            provider,
                            message.params.tabId,
                            languageClient,
                            diffAnimationHandler!
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
                    quickActionDisposable,
                    languageClient,
                    diffAnimationHandler!
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
        languageClient.info(`[message.ts] 🎨 Received openFileDiff notification: ${params.originalFileUri}`)
        languageClient.info(
            `[message.ts] 📏 Original content present: ${!!params.originalFileContent}, length: ${params.originalFileContent?.length || 0}`
        )
        languageClient.info(
            `[message.ts] 📏 New content present: ${!!params.fileContent}, length: ${params.fileContent?.length || 0}`
        )

        if (diffAnimationHandler) {
            await diffAnimationHandler.processFileDiff(params)
        }

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

    languageClient.onNotification(chatUpdateNotificationType.method, async (params: ChatUpdateParams) => {
        languageClient.info(`[message.ts] 🔄 Received chatUpdate notification for tab: ${params.tabId}`)
        languageClient.info(`[message.ts] 📊 Update contains ${params.data?.messages?.length || 0} messages`)

        // Log the messages in the update
        if (params.data?.messages) {
            for (const [index, msg] of params.data.messages.entries()) {
                languageClient.info(`[message.ts]   [${index}] type: ${msg.type}, messageId: ${msg.messageId}`)
                if (msg.header?.fileList) {
                    languageClient.info(`[message.ts]     Has fileList: ${msg.header.fileList.filePaths?.join(', ')}`)
                }
            }
        }

        // Process the update through DiffAnimationHandler
        if (diffAnimationHandler && params.data?.messages) {
            try {
                await diffAnimationHandler.processChatUpdate(params)
            } catch (error) {
                languageClient.error(`[message.ts] ❌ Error processing chat update for animation: ${error}`)
            }
        }

        void provider.webview?.postMessage({
            command: chatUpdateNotificationType.method,
            params: params,
        })
    })

    languageClient.onNotification(chatOptionsUpdateType.method, (params: ChatOptionsUpdateParams) => {
        void provider.webview?.postMessage({
            command: chatOptionsUpdateType.method,
            params: params,
        })
    })

    // Cleanup when provider's webview is disposed
    provider.webviewView?.onDidDispose(() => {
        if (diffAnimationHandler) {
            diffAnimationHandler.dispose()
            diffAnimationHandler = undefined
            languageClient.info('[message.ts] 💥 Disposed DiffAnimationHandler')
        }
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
    tabId: string,
    languageClient: LanguageClient,
    diffAnimationHandler: DiffAnimationHandler
): Promise<T | undefined> {
    languageClient.info(`[message.ts] 📨 Processing partial result for tab ${tabId}`)

    const decryptedMessage =
        typeof partialResult === 'string' && encryptionKey
            ? await decodeRequest<T>(partialResult, encryptionKey)
            : (partialResult as T)

    // Log the structure of the partial result
    languageClient.info(`[message.ts] 📊 Partial result details:`)
    languageClient.info(`[message.ts]   - messageId: ${decryptedMessage.messageId}`)
    languageClient.info(`[message.ts]   - has body: ${!!decryptedMessage.body}`)
    languageClient.info(`[message.ts]   - has header: ${!!decryptedMessage.header}`)
    languageClient.info(`[message.ts]   - has fileList: ${!!decryptedMessage.header?.fileList}`)
    languageClient.info(
        `[message.ts]   - additionalMessages count: ${decryptedMessage.additionalMessages?.length || 0}`
    )

    // Log additional messages in detail
    if (decryptedMessage.additionalMessages && decryptedMessage.additionalMessages.length > 0) {
        languageClient.info(`[message.ts] 📋 Additional messages in partial result:`)
        for (const [index, msg] of decryptedMessage.additionalMessages.entries()) {
            languageClient.info(
                `[message.ts]   [${index}] type: ${msg.type}, messageId: ${msg.messageId}, body length: ${msg.body?.length || 0}`
            )

            // Check for diff content
            if (msg.type === 'system-prompt' && msg.messageId) {
                if (msg.messageId.endsWith('_original') || msg.messageId.endsWith('_new')) {
                    languageClient.info(`[message.ts] 🎯 Found diff content: ${msg.messageId}`)
                }
            }

            // Check for progress messages (file being processed)
            if (msg.type === 'tool' && msg.messageId?.startsWith('progress_')) {
                languageClient.info(`[message.ts] 🎬 Found progress message: ${msg.messageId}`)
                const fileList = msg.header?.fileList
                if (fileList?.filePaths?.[0]) {
                    languageClient.info(`[message.ts] 📁 File being processed: ${fileList.filePaths[0]}`)
                }
            }

            // Check for final tool messages
            if (msg.type === 'tool' && msg.messageId && !msg.messageId.startsWith('progress_')) {
                languageClient.info(`[message.ts] 🔧 Found tool message: ${msg.messageId}`)
                if (msg.header?.fileList) {
                    languageClient.info(`[message.ts]   Files: ${msg.header.fileList.filePaths?.join(', ')}`)
                }
            }
        }
    }

    // Send to UI first
    if (decryptedMessage.body !== undefined) {
        void provider.webview?.postMessage({
            command: chatRequestType.method,
            params: decryptedMessage,
            isPartialResult: true,
            tabId: tabId,
        })
    }

    // Process for diff animation - IMPORTANT: pass true for isPartialResult
    languageClient.info('[message.ts] 🎬 Processing partial result for diff animation')
    try {
        await diffAnimationHandler.processChatResult(decryptedMessage, tabId, true)
    } catch (error) {
        languageClient.error(`[message.ts] ❌ Error processing partial result for animation: ${error}`)
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
    disposable: Disposable,
    languageClient: LanguageClient,
    diffAnimationHandler: DiffAnimationHandler
) {
    languageClient.info(`[message.ts] ✅ Processing complete result for tab ${tabId}`)

    const decryptedMessage =
        typeof result === 'string' && encryptionKey ? await decodeRequest<T>(result, encryptionKey) : (result as T)

    // Log complete result details
    languageClient.info(`[message.ts] 📊 Complete result details:`)
    languageClient.info(`[message.ts]   - Main message ID: ${decryptedMessage.messageId}`)
    languageClient.info(
        `[message.ts]   - Additional messages count: ${decryptedMessage.additionalMessages?.length || 0}`
    )

    // Log additional messages in detail
    if (decryptedMessage.additionalMessages && decryptedMessage.additionalMessages.length > 0) {
        languageClient.info(`[message.ts] 📋 Additional messages in complete result:`)
        for (const [index, msg] of decryptedMessage.additionalMessages.entries()) {
            languageClient.info(
                `[message.ts]   [${index}] type: ${msg.type}, messageId: ${msg.messageId}, body length: ${msg.body?.length || 0}`
            )

            // Check for diff content
            if (msg.type === 'system-prompt' && msg.messageId) {
                if (msg.messageId.endsWith('_original')) {
                    const toolUseId = msg.messageId.replace('_original', '')
                    languageClient.info(
                        `[message.ts] 🎯 Found original diff content for toolUse: ${toolUseId}, content length: ${msg.body?.length || 0}`
                    )
                    // Log first 100 chars of content
                    if (msg.body) {
                        languageClient.info(`[message.ts]   Content preview: ${msg.body.substring(0, 100)}...`)
                    }
                } else if (msg.messageId.endsWith('_new')) {
                    const toolUseId = msg.messageId.replace('_new', '')
                    languageClient.info(
                        `[message.ts] 🎯 Found new diff content for toolUse: ${toolUseId}, content length: ${msg.body?.length || 0}`
                    )
                    // Log first 100 chars of content
                    if (msg.body) {
                        languageClient.info(`[message.ts]   Content preview: ${msg.body.substring(0, 100)}...`)
                    }
                }
            }

            // Check for final tool messages
            if (msg.type === 'tool' && msg.messageId && !msg.messageId.startsWith('progress_')) {
                languageClient.info(`[message.ts] 🔧 Found tool completion message: ${msg.messageId}`)
                if (msg.header?.fileList) {
                    languageClient.info(`[message.ts]   Files affected: ${msg.header.fileList.filePaths?.join(', ')}`)
                }
            }
        }
    }

    // Send to UI
    void provider.webview?.postMessage({
        command: chatRequestType.method,
        params: decryptedMessage,
        tabId: tabId,
    })

    // Process for diff animation - IMPORTANT: pass false for isPartialResult
    languageClient.info('[message.ts] 🎬 Processing complete result for diff animation')
    try {
        await diffAnimationHandler.processChatResult(decryptedMessage, tabId, false)
    } catch (error) {
        languageClient.error(`[message.ts] ❌ Error processing complete result for animation: ${error}`)
    }

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
