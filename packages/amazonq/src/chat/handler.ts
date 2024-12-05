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
import { Webview, window } from 'vscode'
import { Disposable, LanguageClient, Position, State, TextDocumentIdentifier } from 'vscode-languageclient'
import * as jose from 'jose'
import { encryptionKey } from '../lsp/auth'
import { Commands } from 'aws-core-vscode/shared'

export function handle(client: LanguageClient, webview: Webview) {
    // Listen for Initialize handshake from LSP server to register quick actions dynamically
    client.onDidChangeState(({ oldState, newState }) => {
        if (oldState === State.Starting && newState === State.Running) {
            client.info(
                'Language client received initializeResult from server:',
                JSON.stringify(client.initializeResult)
            )

            const chatOptions = client.initializeResult?.awsServerCapabilities?.chatOptions

            void webview.postMessage({
                command: CHAT_OPTIONS,
                params: chatOptions,
            })
        }
    })

    client.onTelemetry((e) => {
        client.info(`[VSCode Client] Received telemetry event from server ${JSON.stringify(e)}`)
    })

    webview.onDidReceiveMessage(async (message) => {
        client.info(`[VSCode Client]  Received ${JSON.stringify(message)} from chat`)

        switch (message.command) {
            case COPY_TO_CLIPBOARD:
                client.info('[VSCode Client] Copy to clipboard event received')
                break
            case INSERT_TO_CURSOR_POSITION: {
                const editor = window.activeTextEditor
                let textDocument: TextDocumentIdentifier | undefined = undefined
                let cursorPosition: Position | undefined = undefined
                if (editor) {
                    cursorPosition = editor.selection.active
                    textDocument = { uri: editor.document.uri.toString() }
                }

                client.sendNotification(insertToCursorPositionNotificationType.method, {
                    ...message.params,
                    cursorPosition,
                    textDocument,
                })
                break
            }
            case AUTH_FOLLOW_UP_CLICKED:
                client.info('[VSCode Client] AuthFollowUp clicked')
                break
            case chatRequestType.method: {
                const partialResultToken = uuidv4()
                const chatDisposable = client.onProgress(chatRequestType, partialResultToken, (partialResult) =>
                    handlePartialResult<ChatResult>(partialResult, encryptionKey, message.params.tabId, webview)
                )

                const editor =
                    window.activeTextEditor ||
                    window.visibleTextEditors.find((editor) => editor.document.languageId !== 'Log')
                if (editor) {
                    message.params.cursorPosition = [editor.selection.active]
                    message.params.textDocument = { uri: editor.document.uri.toString() }
                }

                const chatRequest = await encryptRequest<ChatParams>(message.params, encryptionKey)
                const chatResult = (await client.sendRequest(chatRequestType.method, {
                    ...chatRequest,
                    partialResultToken,
                })) as string | ChatResult
                void handleCompleteResult<ChatResult>(
                    chatResult,
                    encryptionKey,
                    message.params.tabId,
                    chatDisposable,
                    webview
                )
                break
            }
            case quickActionRequestType.method: {
                const quickActionPartialResultToken = uuidv4()
                const quickActionDisposable = client.onProgress(
                    quickActionRequestType,
                    quickActionPartialResultToken,
                    (partialResult) =>
                        handlePartialResult<QuickActionResult>(
                            partialResult,
                            encryptionKey,
                            message.params.tabId,
                            webview
                        )
                )

                const quickActionRequest = await encryptRequest<QuickActionParams>(message.params, encryptionKey)
                const quickActionResult = (await client.sendRequest(quickActionRequestType.method, {
                    ...quickActionRequest,
                    partialResultToken: quickActionPartialResultToken,
                })) as string | ChatResult
                void handleCompleteResult<ChatResult>(
                    quickActionResult,
                    encryptionKey,
                    message.params.tabId,
                    quickActionDisposable,
                    webview
                )
                break
            }
            case followUpClickNotificationType.method:
                if (!isValidAuthFollowUpType(message.params.followUp.type)) {
                    client.sendNotification(followUpClickNotificationType.method, message.params)
                }
                break
            default:
                if (isServerEvent(message.command)) {
                    client.sendNotification(message.command, message.params)
                }
                break
        }
    }, undefined)

    registerGenericCommand('aws.amazonq.explainCode', 'Explain', webview)
    registerGenericCommand('aws.amazonq.refactorCode', 'Refactor', webview)
    registerGenericCommand('aws.amazonq.fixCode', 'Fix', webview)
    registerGenericCommand('aws.amazonq.optimizeCode', 'Optimize', webview)

    Commands.register('aws.amazonq.sendToPrompt', (data) => {
        const triggerType = getCommandTriggerType(data)
        const selection = getSelectedText()

        void webview.postMessage({
            command: 'sendToPrompt',
            params: { selection: selection, triggerType },
        })
    })
}

function getSelectedText(): string {
    const editor = window.activeTextEditor
    if (editor) {
        const selection = editor.selection
        const selectedText = editor.document.getText(selection)
        return selectedText
    }

    return ' '
}

function getCommandTriggerType(data: any): string {
    // data is undefined when commands triggered from keybinding or command palette. Currently no
    // way to differentiate keybinding and command palette, so both interactions are recorded as keybinding
    return data === undefined ? 'hotkeys' : 'contextMenu'
}

function registerGenericCommand(commandName: string, genericCommand: string, webview?: Webview) {
    Commands.register(commandName, (data) => {
        const triggerType = getCommandTriggerType(data)
        const selection = getSelectedText()

        void webview?.postMessage({
            command: 'genericCommand',
            params: { genericCommand, selection, triggerType },
        })
    })
}

function isServerEvent(command: string) {
    return command.startsWith('aws/chat/') || command === 'telemetry/event'
}

// Encrypt the provided request if encryption key exists otherwise do nothing
async function encryptRequest<T>(params: T, encryptionKey: Buffer | undefined): Promise<{ message: string } | T> {
    if (!encryptionKey) {
        return params
    }

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

async function handlePartialResult<T extends ChatResult>(
    partialResult: string | T,
    encryptionKey: Buffer | undefined,
    tabId: string,
    webview: Webview
) {
    const decryptedMessage =
        typeof partialResult === 'string' && encryptionKey
            ? await decodeRequest<T>(partialResult, encryptionKey)
            : (partialResult as T)

    if (decryptedMessage.body) {
        void webview?.postMessage({
            command: chatRequestType.method,
            params: decryptedMessage,
            isPartialResult: true,
            tabId: tabId,
        })
    }
}

async function handleCompleteResult<T>(
    result: string | T,
    encryptionKey: Buffer | undefined,
    tabId: string,
    disposable: Disposable,
    webview: Webview
) {
    const decryptedMessage =
        typeof result === 'string' && encryptionKey ? await decodeRequest(result, encryptionKey) : result

    void webview?.postMessage({
        command: chatRequestType.method,
        params: decryptedMessage,
        tabId: tabId,
    })
    disposable.dispose()
}
