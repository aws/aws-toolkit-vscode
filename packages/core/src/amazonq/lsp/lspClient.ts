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
import * as crypto from 'crypto'
import * as jose from 'jose'

import { Disposable, ExtensionContext } from 'vscode'

import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient'
import {
    BuildIndexRequestPayload,
    BuildIndexRequestType,
    GetUsageRequestType,
    IndexConfig,
    QueryInlineProjectContextRequestType,
    QueryVectorIndexRequestType,
    UpdateIndexV2RequestPayload,
    UpdateIndexV2RequestType,
    QueryRepomapIndexRequestType,
    GetRepomapIndexJSONRequestType,
    Usage,
    GetContextCommandItemsRequestType,
    ContextCommandItem,
    GetIndexSequenceNumberRequestType,
    GetContextCommandPromptRequestType,
    AdditionalContextPrompt,
} from './types'
import { CodeWhispererSettings } from '../../codewhisperer/util/codewhispererSettings'
import { fs } from '../../shared/fs/fs'
import { getLogger } from '../../shared/logger/logger'
import globals from '../../shared/extensionGlobals'
import { ResourcePaths } from '../../shared/lsp/types'
import { createServerOptions } from '../../shared/lsp/utils/platform'
import { waitUntil } from '../../shared/utilities/timeoutUtils'

const localize = nls.loadMessageBundle()

const key = crypto.randomBytes(32)

/**
 * LspClient manages the API call between VS Code extension and LSP server
 * It encryptes the payload of API call.
 */
export class LspClient {
    static #instance: LspClient
    client: LanguageClient | undefined

    public static get instance() {
        return (this.#instance ??= new this())
    }

    constructor() {
        this.client = undefined
    }

    async encrypt(payload: string) {
        return await new jose.CompactEncrypt(new TextEncoder().encode(payload))
            .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
            .encrypt(key)
    }

    async buildIndex(paths: string[], rootPath: string, config: IndexConfig) {
        const payload: BuildIndexRequestPayload = {
            filePaths: paths,
            projectRoot: rootPath,
            config: config,
            language: '',
        }
        try {
            const encryptedRequest = await this.encrypt(JSON.stringify(payload))
            const resp = await this.client?.sendRequest(BuildIndexRequestType, encryptedRequest)
            return resp
        } catch (e) {
            getLogger().error(`LspClient: buildIndex error: ${e}`)
            return undefined
        }
    }

    async queryVectorIndex(request: string) {
        try {
            const encryptedRequest = await this.encrypt(
                JSON.stringify({
                    query: request,
                })
            )
            const resp = await this.client?.sendRequest(QueryVectorIndexRequestType, encryptedRequest)
            return resp
        } catch (e) {
            getLogger().error(`LspClient: queryVectorIndex error: ${e}`)
            return []
        }
    }

    async queryInlineProjectContext(query: string, path: string, target: 'default' | 'codemap' | 'bm25') {
        try {
            const request = JSON.stringify({
                query: query,
                filePath: path,
                target,
            })
            const encrypted = await this.encrypt(request)
            const resp: any = await this.client?.sendRequest(QueryInlineProjectContextRequestType, encrypted)
            return resp
        } catch (e) {
            getLogger().error(`LspClient: queryInlineProjectContext error: ${e}`)
            throw e
        }
    }

    async getLspServerUsage(): Promise<Usage | undefined> {
        if (this.client) {
            return (await this.client.sendRequest(GetUsageRequestType, '')) as Usage
        }
    }

    async updateIndex(filePath: string[], mode: 'update' | 'remove' | 'add' | 'context_command_symbol_update') {
        const payload: UpdateIndexV2RequestPayload = {
            filePaths: filePath,
            updateMode: mode,
        }
        try {
            const encryptedRequest = await this.encrypt(JSON.stringify(payload))
            const resp = await this.client?.sendRequest(UpdateIndexV2RequestType, encryptedRequest)
            return resp
        } catch (e) {
            getLogger().error(`LspClient: updateIndex error: ${e}`)
            return undefined
        }
    }
    async queryRepomapIndex(filePaths: string[]) {
        try {
            const request = JSON.stringify({
                filePaths: filePaths,
            })
            const resp: any = await this.client?.sendRequest(QueryRepomapIndexRequestType, await this.encrypt(request))
            return resp
        } catch (e) {
            getLogger().error(`LspClient: QueryRepomapIndex error: ${e}`)
            throw e
        }
    }
    async getRepoMapJSON() {
        try {
            const request = JSON.stringify({})
            const resp: any = await this.client?.sendRequest(
                GetRepomapIndexJSONRequestType,
                await this.encrypt(request)
            )
            return resp
        } catch (e) {
            getLogger().error(`LspClient: queryInlineProjectContext error: ${e}`)
            throw e
        }
    }

    async getContextCommandItems(): Promise<ContextCommandItem[]> {
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders || []
            const request = JSON.stringify({
                workspaceFolders: workspaceFolders.map((it) => it.uri.fsPath),
            })
            const resp: any = await this.client?.sendRequest(
                GetContextCommandItemsRequestType,
                await this.encrypt(request)
            )
            return resp
        } catch (e) {
            getLogger().error(`LspClient: getContextCommandItems error: ${e}`)
            throw e
        }
    }

    async getContextCommandPrompt(contextCommandItems: ContextCommandItem[]): Promise<AdditionalContextPrompt[]> {
        try {
            const request = JSON.stringify({
                contextCommands: contextCommandItems,
            })
            const resp: any = await this.client?.sendRequest(
                GetContextCommandPromptRequestType,
                await this.encrypt(request)
            )
            return resp
        } catch (e) {
            getLogger().error(`LspClient: getContextCommandPrompt error: ${e}`)
            throw e
        }
    }

    async getIndexSequenceNumber(): Promise<number> {
        try {
            const request = JSON.stringify({})
            const resp: any = await this.client?.sendRequest(
                GetIndexSequenceNumberRequestType,
                await this.encrypt(request)
            )
            return resp
        } catch (e) {
            getLogger().error(`LspClient: getIndexSequenceNumber error: ${e}`)
            throw e
        }
    }

    async waitUntilReady() {
        return waitUntil(
            async () => {
                if (this.client === undefined) {
                    return false
                }
                await this.client.onReady()
                return true
            },
            { interval: 500, timeout: 60_000 * 3, truthy: true }
        )
    }
}
/**
 * Activates the language server, this will start LSP server running over IPC protocol.
 * It will create a output channel named Amazon Q Language Server.
 * This function assumes the LSP server has already been downloaded.
 */
export async function activate(extensionContext: ExtensionContext, resourcePaths: ResourcePaths) {
    LspClient.instance
    const toDispose = extensionContext.subscriptions

    let rangeFormatting: Disposable | undefined
    // The debug options for the server
    // --inspect=6009: runs the server in Node's Inspector mode so VS Code can attach to the server for debugging
    const debugOptions = { execArgv: ['--nolazy', '--preserve-symlinks', '--stdio'] }

    const workerThreads = CodeWhispererSettings.instance.getIndexWorkerThreads()
    const gpu = CodeWhispererSettings.instance.isLocalIndexGPUEnabled()

    if (gpu) {
        process.env.Q_ENABLE_GPU = 'true'
    } else {
        delete process.env.Q_ENABLE_GPU
    }
    if (workerThreads > 0 && workerThreads < 100) {
        process.env.Q_WORKER_THREADS = workerThreads.toString()
    } else {
        delete process.env.Q_WORKER_THREADS
    }

    const serverModule = resourcePaths.lsp

    // If the extension is launch in debug mode the debug server options are use
    // Otherwise the run options are used
    let serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions },
    }

    serverOptions = createServerOptions({
        encryptionKey: key,
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
            handledSchemaProtocols: ['file', 'untitled'], // language server only loads file-URI. Fetching schemas with other protocols ('http'...) are made on the client.
            provideFormatter: false, // tell the server to not provide formatting capability and ignore the `aws.stepfunctions.asl.format.enable` setting.
            // this is used by LSP to determine index cache path, move to this folder so that when extension updates index is not deleted.
            extensionPath: path.join(fs.getUserHomeDir(), '.aws', 'amazonq', 'cache'),
        },
        // Log to the Amazon Q Logs so everything is in a single channel
        // TODO: Add prefix to the language server logs so it is easier to search
        outputChannel: globals.logOutputChannel,
    }

    // Create the language client and start the client.
    LspClient.instance.client = new LanguageClient(
        'amazonq',
        localize('amazonq.server.name', 'Amazon Q Language Server'),
        serverOptions,
        clientOptions
    )
    LspClient.instance.client.registerProposedFeatures()

    const disposable = LspClient.instance.client.start()
    toDispose.push(disposable)

    let savedDocument: vscode.Uri | undefined = undefined

    const onAdd = async (filePaths: string[]) => {
        const indexSeqNum = await LspClient.instance.getIndexSequenceNumber()
        await LspClient.instance.updateIndex(filePaths, 'add')
        await waitUntil(
            async () => {
                const newIndexSeqNum = await LspClient.instance.getIndexSequenceNumber()
                if (newIndexSeqNum > indexSeqNum) {
                    await vscode.commands.executeCommand(`aws.amazonq.updateContextCommandItems`)
                    return true
                }
                return false
            },
            { interval: 500, timeout: 5_000, truthy: true }
        )
    }
    const onRemove = async (filePaths: string[]) => {
        const indexSeqNum = await LspClient.instance.getIndexSequenceNumber()
        await LspClient.instance.updateIndex(filePaths, 'remove')
        await waitUntil(
            async () => {
                const newIndexSeqNum = await LspClient.instance.getIndexSequenceNumber()
                if (newIndexSeqNum > indexSeqNum) {
                    await vscode.commands.executeCommand(`aws.amazonq.updateContextCommandItems`)
                    return true
                }
                return false
            },
            { interval: 500, timeout: 5_000, truthy: true }
        )
    }

    toDispose.push(
        vscode.workspace.onDidSaveTextDocument((document) => {
            if (document.uri.scheme !== 'file') {
                return
            }
            savedDocument = document.uri
        }),
        vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (savedDocument && editor && editor.document.uri.fsPath !== savedDocument.fsPath) {
                void LspClient.instance.updateIndex([savedDocument.fsPath], 'update')
            }
            // user created a new empty file using File -> New File
            // these events will not be captured by vscode.workspace.onDidCreateFiles
            // because it was created by File Explorer(Win) or Finder(MacOS)
            // TODO: consider using a high performance fs watcher
            if (editor?.document.getText().length === 0) {
                void onAdd([editor.document.uri.fsPath])
            }
        }),
        vscode.workspace.onDidCreateFiles(async (e) => {
            await onAdd(e.files.map((f) => f.fsPath))
        }),
        vscode.workspace.onDidDeleteFiles(async (e) => {
            await onRemove(e.files.map((f) => f.fsPath))
        }),
        vscode.workspace.onDidRenameFiles(async (e) => {
            await onRemove(e.files.map((f) => f.oldUri.fsPath))
            await onAdd(e.files.map((f) => f.newUri.fsPath))
        })
    )

    return LspClient.instance.client.onReady().then(() => {
        const disposableFunc = { dispose: () => rangeFormatting?.dispose() as void }
        toDispose.push(disposableFunc)
    })
}

export async function deactivate(): Promise<any> {
    if (!LspClient.instance.client) {
        return undefined
    }
    return LspClient.instance.client.stop()
}
