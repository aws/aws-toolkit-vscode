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
} from '@aws/language-server-runtimes/protocol'
import { v4 as uuidv4 } from 'uuid'
import { window } from 'vscode'
import { Disposable, LanguageClient, Position, State, TextDocumentIdentifier } from 'vscode-languageclient'
import * as jose from 'jose'
import { AmazonQChatViewProvider } from './webviewProvider'
import { AuthUtil } from 'aws-core-vscode/codewhisperer'

export function registerLanguageServerEventListener(languageClient: LanguageClient, provider: AmazonQChatViewProvider) {
    languageClient.onDidChangeState(({ oldState, newState }) => {
        if (oldState === State.Starting && newState === State.Running) {
            languageClient.info(
                'Language client received initializeResult from server:',
                JSON.stringify(languageClient.initializeResult)
            )

            const chatOptions = languageClient.initializeResult?.awsServerCapabilities?.chatOptions

            void provider.webview?.postMessage({
                command: CHAT_OPTIONS,
                params: chatOptions,
            })
        }
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

        switch (message.command) {
            case COPY_TO_CLIPBOARD:
                // TODO see what we need to hook this up
                languageClient.info('[VSCode Client] Copy to clipboard event received')
                break
            case INSERT_TO_CURSOR_POSITION: {
                const editor = window.activeTextEditor
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
            case chatRequestType.method: {
                const partialResultToken = uuidv4()
                const chatDisposable = languageClient.onProgress(chatRequestType, partialResultToken, (partialResult) =>
                    handlePartialResult<ChatResult>(partialResult, encryptionKey, provider, message.params.tabId)
                )

                const editor =
                    window.activeTextEditor ||
                    window.visibleTextEditors.find((editor) => editor.document.languageId !== 'Log')
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
