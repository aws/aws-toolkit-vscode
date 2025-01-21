/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import vscode, { env, version } from 'vscode'
import * as nls from 'vscode-nls'
import * as crypto from 'crypto'
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient'
import { registerInlineCompletion } from '../inline/completion'
import { AmazonQLspAuth, encryptionKey, notificationTypes } from './auth'
import { AuthUtil } from 'aws-core-vscode/codewhisperer'
import { ConnectionMetadata } from '@aws/language-server-runtimes/protocol'
import { ResourcePaths, createServerOptions } from 'aws-core-vscode/shared'

const localize = nls.loadMessageBundle()

export async function startLanguageServer(extensionContext: vscode.ExtensionContext, resourcePaths: ResourcePaths) {
    const toDispose = extensionContext.subscriptions

    // The debug options for the server
    // --inspect=6009: runs the server in Node's Inspector mode so VS Code can attach to the server for debugging
    const debugOptions = {
        execArgv: [
            '--nolazy',
            '--preserve-symlinks',
            '--stdio',
            '--pre-init-encryption',
            '--set-credentials-encryption-key',
        ],
    }

    const serverModule = resourcePaths.lsp

    // If the extension is launch in debug mode the debug server options are use
    // Otherwise the run options are used
    let serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions },
    }

    serverOptions = createServerOptions({
        encryptionKey,
        executable: resourcePaths.node,
        serverModule,
        execArgv: debugOptions.execArgv,
    })

    const documentSelector = [{ scheme: 'file', language: '*' }]

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
                        name: `AWS IDE Extensions for VSCode`, // TODO change this to C9/Amazon
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
    }

    const client = new LanguageClient(
        'amazonq',
        localize('amazonq.server.name', 'Amazon Q Language Server'),
        serverOptions,
        clientOptions
    )

    const disposable = client.start()
    toDispose.push(disposable)

    const auth = new AmazonQLspAuth(client)

    return client.onReady().then(async () => {
        await auth.init()
        registerInlineCompletion(client)

        // Request handler for when the server wants to know about the clients auth connnection
        client.onRequest<ConnectionMetadata, Error>(notificationTypes.getConnectionMetadata.method, () => {
            return {
                sso: {
                    startUrl: AuthUtil.instance.auth.startUrl,
                },
            }
        })

        toDispose.push(
            AuthUtil.instance.auth.onDidChangeActiveConnection(async () => {
                await auth.init()
            }),
            AuthUtil.instance.auth.onDidDeleteConnection(async () => {
                client.sendNotification(notificationTypes.deleteBearerToken.method)
            })
        )
    })
}
