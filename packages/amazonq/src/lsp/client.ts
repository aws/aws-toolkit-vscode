/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import vscode, { env, version } from 'vscode'
import * as nls from 'vscode-nls'
import * as crypto from 'crypto'
import * as jose from 'jose'
import { LanguageClient, LanguageClientOptions } from 'vscode-languageclient'
import { InlineCompletionManager } from '../app/inline/completion'
import { AuthUtil } from 'aws-core-vscode/codewhisperer'
import {
    ConnectionMetadata,
    GetSsoTokenProgress,
    GetSsoTokenProgressToken,
    GetSsoTokenProgressType,
    MessageActionItem,
    ShowDocumentParams,
    ShowDocumentRequest,
    ShowDocumentResult,
    ShowMessageRequest,
    ShowMessageRequestParams,
} from '@aws/language-server-runtimes/protocol'
import {
    Settings,
    oidcClientName,
    createServerOptions,
    globals,
    Experiments,
    Commands,
    openUrl,
    getLogger,
} from 'aws-core-vscode/shared'
import { activate } from './chat/activation'
import { AmazonQResourcePaths } from './lspInstaller'
import { auth2 } from 'aws-core-vscode/auth'

const localize = nls.loadMessageBundle()

export const clientId = 'amazonq'
export const clientName = oidcClientName()
export const encryptionKey = crypto.randomBytes(32)

export async function startLanguageServer(
    extensionContext: vscode.ExtensionContext,
    resourcePaths: AmazonQResourcePaths
): Promise<LanguageClient> {
    const toDispose = extensionContext.subscriptions

    const serverModule = resourcePaths.lsp

    const serverOptions = createServerOptions({
        encryptionKey,
        executable: resourcePaths.node,
        serverModule,
        execArgv: [
            '--nolazy',
            '--preserve-symlinks',
            '--stdio',
            '--pre-init-encryption',
            '--set-credentials-encryption-key',
        ],
    })

    const documentSelector = [{ scheme: 'file', language: '*' }]
    const traceServerEnabled = Settings.instance.isSet(`${clientId}.trace.server`)

    // Options to control the language client
    const clientOptions: LanguageClientOptions = {
        // Register the server for json documents
        documentSelector,
        initializationOptions: {
            aws: {
                clientInfo: {
                    name: env.appName,
                    version: version,
                    extension: {
                        name: oidcClientName(),
                        version: '0.0.1',
                    },
                    clientId: crypto.randomUUID(),
                },
                awsClientCapabilities: {
                    window: {
                        notifications: true,
                    },
                },
            },
            credentials: {
                providesBearerToken: true,
            },
        },
        /**
         * When the trace server is enabled it outputs a ton of log messages so:
         *   When trace server is enabled, logs go to a seperate "Amazon Q Language Server" output.
         *   Otherwise, logs go to the regular "Amazon Q Logs" channel.
         */
        ...(traceServerEnabled
            ? {}
            : {
                  outputChannel: globals.logOutputChannel,
              }),
    }

    const lspName = localize('amazonq.server.name', 'Amazon Q Language Server')
    const client = new LanguageClient(clientId, lspName, serverOptions, clientOptions)

    const disposable = client.start()
    toDispose.push(disposable)

    await client.onReady()

    // Request handler for when the server wants to know about the clients auth connnection. Must be registered before the initial auth init call
    client.onRequest<ConnectionMetadata, Error>(auth2.notificationTypes.getConnectionMetadata.method, () => {
        return {
            sso: {
                startUrl: AuthUtil.instance.connection?.startUrl,
            },
        }
    })

    client.onRequest<ShowDocumentResult, Error>(ShowDocumentRequest.method, async (params: ShowDocumentParams) => {
        try {
            return { success: await openUrl(vscode.Uri.parse(params.uri), lspName) }
        } catch (err: any) {
            getLogger().error(`Failed to open document for LSP: ${lspName}, error: %s`, err)
            return { success: false }
        }
    })

    client.onRequest<MessageActionItem | null, Error>(
        ShowMessageRequest.method,
        async (params: ShowMessageRequestParams) => {
            const actions = params.actions?.map((a) => a.title) ?? []
            const response = await vscode.window.showInformationMessage(params.message, { modal: true }, ...actions)
            return params.actions?.find((a) => a.title === response) ?? (undefined as unknown as null)
        }
    )

    let promise: Promise<void> | undefined
    let resolver: () => void = () => {}
    client.onProgress(GetSsoTokenProgressType, GetSsoTokenProgressToken, async (partialResult: GetSsoTokenProgress) => {
        const decryptedKey = await jose.compactDecrypt(partialResult as unknown as string, encryptionKey)
        const val: GetSsoTokenProgress = JSON.parse(decryptedKey.plaintext.toString())

        if (val.state === 'InProgress') {
            if (promise) {
                resolver()
            }
            promise = new Promise<void>((resolve) => {
                resolver = resolve
            })
        } else {
            resolver()
            promise = undefined
            return
        }

        void vscode.window.withProgress(
            {
                cancellable: true,
                location: vscode.ProgressLocation.Notification,
                title: val.message,
            },
            async (_) => {
                await promise
            }
        )
    })

    if (Experiments.instance.get('amazonqLSPInline', false)) {
        const inlineManager = new InlineCompletionManager(client)
        inlineManager.registerInlineCompletion()
        toDispose.push(
            inlineManager,
            Commands.register({ id: 'aws.amazonq.invokeInlineCompletion', autoconnect: true }, async () => {
                await vscode.commands.executeCommand('editor.action.inlineSuggest.trigger')
            }),
            vscode.workspace.onDidCloseTextDocument(async () => {
                await vscode.commands.executeCommand('aws.amazonq.rejectCodeSuggestion')
            })
        )
    }

    if (Experiments.instance.get('amazonqChatLSP', false)) {
        activate(client, encryptionKey, resourcePaths.ui)
    }

    return client
}
