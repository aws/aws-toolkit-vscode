/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import vscode, { env, version } from 'vscode'
import * as nls from 'vscode-nls'
import * as crypto from 'crypto'
import { LanguageClient, LanguageClientOptions, RequestType } from 'vscode-languageclient'
import { InlineCompletionManager } from '../app/inline/completion'
import { AmazonQLspAuth, encryptionKey, notificationTypes } from './auth'
import { AuthUtil } from 'aws-core-vscode/codewhisperer'
import {
    ConnectionMetadata,
    CreateFilesParams,
    DeleteFilesParams,
    DidChangeWorkspaceFoldersParams,
    DidSaveTextDocumentParams,
    GetConfigurationFromServerParams,
    RenameFilesParams,
    ResponseMessage,
    WorkspaceFolder,
} from '@aws/language-server-runtimes/protocol'
import {
    Settings,
    oidcClientName,
    createServerOptions,
    globals,
    Experiments,
    Commands,
    oneSecond,
} from 'aws-core-vscode/shared'
import { activate } from './chat/activation'
import { AmazonQResourcePaths } from './lspInstaller'

const localize = nls.loadMessageBundle()

export async function startLanguageServer(
    extensionContext: vscode.ExtensionContext,
    resourcePaths: AmazonQResourcePaths
) {
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

    const clientId = 'amazonq'
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

    const client = new LanguageClient(
        clientId,
        localize('amazonq.server.name', 'Amazon Q Language Server'),
        serverOptions,
        clientOptions
    )

    const disposable = client.start()
    toDispose.push(disposable)

    const auth = new AmazonQLspAuth(client)

    return client.onReady().then(async () => {
        // Request handler for when the server wants to know about the clients auth connnection. Must be registered before the initial auth init call
        client.onRequest<ConnectionMetadata, Error>(notificationTypes.getConnectionMetadata.method, () => {
            return {
                sso: {
                    startUrl: AuthUtil.instance.auth.startUrl,
                },
            }
        })
        await auth.refreshConnection()

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

        const refreshInterval = auth.startTokenRefreshInterval(10 * oneSecond)

        toDispose.push(
            AuthUtil.instance.auth.onDidChangeActiveConnection(async () => {
                await auth.refreshConnection()
            }),
            AuthUtil.instance.auth.onDidDeleteConnection(async () => {
                client.sendNotification(notificationTypes.deleteBearerToken.method)
            }),
            vscode.commands.registerCommand('aws.amazonq.getWorkspaceId', async () => {
                const requestType = new RequestType<GetConfigurationFromServerParams, ResponseMessage, Error>(
                    'aws/getConfigurationFromServer'
                )
                const workspaceIdResp = await client.sendRequest(requestType.method, {
                    section: 'aws.q.workspaceContext',
                })
                return workspaceIdResp
            }),
            vscode.workspace.onDidCreateFiles((e) => {
                client.sendNotification('workspace/didCreateFiles', {
                    files: e.files.map((it) => {
                        return { uri: it.fsPath }
                    }),
                } as CreateFilesParams)
            }),
            vscode.workspace.onDidDeleteFiles((e) => {
                client.sendNotification('workspace/didDeleteFiles', {
                    files: e.files.map((it) => {
                        return { uri: it.fsPath }
                    }),
                } as DeleteFilesParams)
            }),
            vscode.workspace.onDidRenameFiles((e) => {
                client.sendNotification('workspace/didRenameFiles', {
                    files: e.files.map((it) => {
                        return { oldUri: it.oldUri.fsPath, newUri: it.newUri.fsPath }
                    }),
                } as RenameFilesParams)
            }),
            vscode.workspace.onDidSaveTextDocument((e) => {
                client.sendNotification('workspace/didSaveTextDocument', {
                    textDocument: {
                        uri: e.uri.fsPath,
                    },
                } as DidSaveTextDocumentParams)
            }),
            vscode.workspace.onDidChangeWorkspaceFolders((e) => {
                client.sendNotification('workspace/didChangeWorkspaceFolder', {
                    event: {
                        added: e.added.map((it) => {
                            return {
                                name: it.name,
                                uri: it.uri.fsPath,
                            } as WorkspaceFolder
                        }),
                        removed: e.removed.map((it) => {
                            return {
                                name: it.name,
                                uri: it.uri.fsPath,
                            } as WorkspaceFolder
                        }),
                    },
                } as DidChangeWorkspaceFoldersParams)
            }),
            { dispose: () => clearInterval(refreshInterval) }
        )
    })
}
