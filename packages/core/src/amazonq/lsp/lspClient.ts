/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/*!
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 */
import * as vscode from 'vscode'
import * as path from 'path'
import * as nls from 'vscode-nls'
import * as cp from 'child_process'
import * as crypto from 'crypto'
import * as jose from 'jose'

import { Disposable, ExtensionContext } from 'vscode'

import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient'
import {
    ClearRequestType,
    GetUsageRequestType,
    IndexRequestType,
    QueryRequestType,
    UpdateIndexRequestType,
    Usage,
} from './types'
import { Writable } from 'stream'
import { CodeWhispererSettings } from '../../codewhisperer/util/codewhispererSettings'

const localize = nls.loadMessageBundle()
let client: LanguageClient | undefined = undefined

const key = crypto.randomBytes(32)

async function encrypt(payload: string) {
    return await new jose.CompactEncrypt(new TextEncoder().encode(payload))
        .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
        .encrypt(key)
}

export async function indexFiles(request: string[], rootPath: string, refresh: boolean) {
    if (client) {
        const encryptedRequest = await encrypt(
            JSON.stringify({
                filePaths: request,
                rootPath: rootPath,
                refresh: refresh,
            })
        )
        const resp = await client.sendRequest(IndexRequestType, encryptedRequest)
        return resp
    }
}

export async function query(request: string) {
    if (client) {
        const resp = await client.sendRequest(
            QueryRequestType,
            await encrypt(
                JSON.stringify({
                    query: request,
                })
            )
        )
        return resp
    }
}

export async function clear(request: string) {
    if (client) {
        const resp = await client.sendRequest(ClearRequestType, await encrypt(JSON.stringify({})))
        return resp
    }
}

export async function getLspServerUsage(): Promise<Usage | undefined> {
    if (client) {
        return (await client.sendRequest(GetUsageRequestType, '')) as Usage
    }
}

export async function updateIndex(filePath: string) {
    if (client) {
        const resp = await client.sendRequest(
            UpdateIndexRequestType,
            await encrypt(
                JSON.stringify({
                    filePath: filePath,
                })
            )
        )
        return resp
    }
}

export function writeEncryptionInit(stream: Writable): void {
    const request = {
        version: '1.0',
        mode: 'JWT',
        key: key.toString('base64'),
    }
    stream.write(JSON.stringify(request))
    stream.write('\n')
}
type EnvType = {
    [key: string]: string | undefined
}

export async function activate(extensionContext: ExtensionContext) {
    const toDispose = extensionContext.subscriptions

    let rangeFormatting: Disposable | undefined
    // The server is implemented in node
    let serverModule = path.join(extensionContext.extensionPath, 'resources/qserver/lspServer.js')
    // The debug options for the server
    // --inspect=6009: runs the server in Node's Inspector mode so VS Code can attach to the server for debugging
    const debugOptions = { execArgv: ['--nolazy', '--inspect=6009', '--preserve-symlinks', '--stdio'] }

    const workerThreads = CodeWhispererSettings.instance.getIndexWorkerThreads()
    let child: cp.ChildProcessWithoutNullStreams | undefined = undefined
    if (workerThreads > 0 && workerThreads < 100) {
        const env: EnvType = {
            Q_WORKER_THREADS: workerThreads.toString(),
            // must have PATH otherwise it throws Error: spawn node ENOENT" when using child_process in Node.js
            PATH: process.env.PATH,
        }
        child = cp.spawn(
            extensionContext.asAbsolutePath(path.join('resources', 'node')),
            [serverModule, ...debugOptions.execArgv],
            {
                env: env,
            }
        )
    } else {
        child = cp.spawn(extensionContext.asAbsolutePath(path.join('resources', 'node')), [
            serverModule,
            ...debugOptions.execArgv,
        ])
    }

    // share an encryption key using stdin
    // follow same practice of DEXP LSP server
    writeEncryptionInit(child.stdin)

    // If the extension is launch in debug mode the debug server options are use
    // Otherwise the run options are used
    let serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions },
    }

    serverOptions = () => Promise.resolve(child!!)

    const documentSelector = [{ scheme: 'file', language: '*' }]

    // Options to control the language client
    const clientOptions: LanguageClientOptions = {
        // Register the server for json documents
        documentSelector,
        initializationOptions: {
            handledSchemaProtocols: ['file', 'untitled'], // language server only loads file-URI. Fetching schemas with other protocols ('http'...) are made on the client.
            provideFormatter: false, // tell the server to not provide formatting capability and ignore the `aws.stepfunctions.asl.format.enable` setting.
            extensionPath: extensionContext.extensionPath,
        },
    }

    // Create the language client and start the client.
    client = new LanguageClient(
        'codewhisperer',
        localize('codewhisperer.server.name', 'Amazon Q Language Server'),
        serverOptions,
        clientOptions
    )
    client.registerProposedFeatures()

    const disposable = client.start()
    toDispose.push(disposable)

    let savedDocument: vscode.Uri | undefined = undefined

    toDispose.push(
        vscode.workspace.onDidSaveTextDocument(document => {
            if (document.uri.scheme !== 'file') {
                return
            }
            savedDocument = document.uri
        })
    )
    toDispose.push(
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (savedDocument && editor && editor.document.uri.fsPath !== savedDocument.fsPath) {
                updateIndex(savedDocument.fsPath)
            }
        })
    )
    return client.onReady().then(() => {
        const disposableFunc = { dispose: () => rangeFormatting?.dispose() as void }
        toDispose.push(disposableFunc)
    })
}

export async function deactivate(): Promise<any> {
    if (!client) {
        return undefined
    }
    return client.stop()
}
