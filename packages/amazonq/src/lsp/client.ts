/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import vscode, { env, version } from 'vscode'
import * as nls from 'vscode-nls'
import * as crypto from 'crypto'
import * as jose from 'jose'
import { LanguageClient, LanguageClientOptions, RequestType, State } from 'vscode-languageclient'
import {
    CreateFilesParams,
    DeleteFilesParams,
    DidChangeWorkspaceFoldersParams,
    DidSaveTextDocumentParams,
    GetConfigurationFromServerParams,
    RenameFilesParams,
    ResponseMessage,
    WorkspaceFolder,
    GetSsoTokenProgress,
    GetSsoTokenProgressToken,
    GetSsoTokenProgressType,
    MessageActionItem,
    ShowMessageRequest,
    ShowMessageRequestParams,
    ConnectionMetadata,
    ShowDocumentRequest,
    ShowDocumentParams,
    ShowDocumentResult,
    ResponseError,
    LSPErrorCodes,
    updateConfigurationRequestType,
} from '@aws/language-server-runtimes/protocol'
import { AuthUtil, CodeWhispererSettings, getSelectedCustomization } from 'aws-core-vscode/codewhisperer'
import {
    Settings,
    createServerOptions,
    globals,
    Experiments,
    validateNodeExe,
    getLogger,
    undefinedIfEmpty,
    getOptOutPreference,
    isAmazonLinux2,
    oidcClientName,
    openUrl,
    getClientId,
    extensionVersion,
} from 'aws-core-vscode/shared'
import { processUtils } from 'aws-core-vscode/shared'
import { activate as activateChat } from './chat/activation'
import { AmazonQResourcePaths } from './lspInstaller'
import { auth2 } from 'aws-core-vscode/auth'
import { ConfigSection, isValidConfigSection, pushConfigUpdate, toAmazonQLSPLogLevel } from './config'
import { telemetry } from 'aws-core-vscode/telemetry'

const localize = nls.loadMessageBundle()
const logger = getLogger('amazonqLsp.lspClient')

export const glibcLinker: string = process.env.VSCODE_SERVER_CUSTOM_GLIBC_LINKER || ''
export const glibcPath: string = process.env.VSCODE_SERVER_CUSTOM_GLIBC_PATH || ''
export function hasGlibcPatch(): boolean {
    return glibcLinker.length > 0 && glibcPath.length > 0
}

export const clientId = 'amazonq'
export const clientName = oidcClientName()
export const encryptionKey = crypto.randomBytes(32)

export async function startLanguageServer(
    extensionContext: vscode.ExtensionContext,
    resourcePaths: AmazonQResourcePaths
): Promise<LanguageClient> {
    const toDispose = extensionContext.subscriptions

    const serverModule = resourcePaths.lsp

    const argv = [
        '--nolazy',
        '--preserve-symlinks',
        '--stdio',
        '--pre-init-encryption',
        '--set-credentials-encryption-key',
    ]

    const documentSelector = [{ scheme: 'file', language: '*' }]
    const traceServerEnabled = Settings.instance.isSet(`${clientId}.trace.server`)
    let executable: string[] = []
    // apply the GLIBC 2.28 path to node js runtime binary
    if (isAmazonLinux2() && hasGlibcPatch()) {
        executable = [glibcLinker, '--library-path', glibcPath, resourcePaths.node]
        getLogger('amazonqLsp').info(`Patched node runtime with GLIBC to ${executable}`)
    } else {
        executable = [resourcePaths.node]
    }

    const memoryWarnThreshold = 1024 * processUtils.oneMB
    const serverOptions = createServerOptions({
        encryptionKey,
        executable: executable,
        serverModule,
        execArgv: argv,
        warnThresholds: { memory: memoryWarnThreshold },
    })

    await validateNodeExe(executable, resourcePaths.lsp, argv, logger)

    // Options to control the language client
    const clientName = 'AmazonQ-For-VSCode'
    const clientOptions: LanguageClientOptions = {
        // Register the server for json documents
        documentSelector,
        middleware: {
            workspace: {
                /**
                 * Convert VSCode settings format to be compatible with flare's configs
                 */
                configuration: async (params, token, next) => {
                    const config = await next(params, token)
                    const section = params.items[0].section
                    if (!isValidConfigSection(section)) {
                        return config
                    }
                    return getConfigSection(section)
                },
            },
        },
        initializationOptions: {
            aws: {
                clientInfo: {
                    name: env.appName,
                    version: version,
                    extension: {
                        name: clientName,
                        version: extensionVersion,
                    },
                    clientId: getClientId(globals.globalState),
                },
                awsClientCapabilities: {
                    q: {
                        developerProfiles: true,
                    },
                    window: {
                        notifications: true,
                        showSaveFileDialog: true,
                    },
                },
                contextConfiguration: {
                    workspaceIdentifier: extensionContext.storageUri?.path,
                },
                logLevel: toAmazonQLSPLogLevel(globals.logOutputChannel.logLevel),
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

    /**
     * We use the Flare Auth language server, and our Auth client depends on it.
     * Because of this we initialize our Auth client **immediately** after the language server is ready.
     * Doing this removes the chance of something else attempting to use the Auth client before it is ready.
     */
    await initializeAuth(client)

    await postStartLanguageServer(client, resourcePaths, toDispose)

    return client

    async function initializeAuth(client: LanguageClient) {
        AuthUtil.create(new auth2.LanguageClientAuth(client, clientId, encryptionKey))

        // Migrate SSO connections from old Auth to the LSP identity server
        // This function only migrates connections once
        // This call can be removed once all/most users have updated to the latest AmazonQ version
        try {
            await AuthUtil.instance.migrateSsoConnectionToLsp(clientName)
        } catch (e) {
            getLogger().error(`Error while migration SSO connection to Amazon Q LSP: ${e}`)
        }

        /** All must be setup before {@link AuthUtil.restore} otherwise they may not trigger when expected */
        AuthUtil.instance.regionProfileManager.onDidChangeRegionProfile(async () => {
            void pushConfigUpdate(client, {
                type: 'profile',
                profileArn: AuthUtil.instance.regionProfileManager.activeRegionProfile?.arn,
            })
        })

        // Try and restore a cached connection if exists
        await AuthUtil.instance.restore()
    }
}

async function postStartLanguageServer(
    client: LanguageClient,
    resourcePaths: AmazonQResourcePaths,
    toDispose: vscode.Disposable[]
) {
    // Request handler for when the server wants to know about the clients auth connnection. Must be registered before the initial auth init call
    client.onRequest<ConnectionMetadata, Error>(auth2.notificationTypes.getConnectionMetadata.method, () => {
        return {
            sso: {
                startUrl: AuthUtil.instance.connection?.startUrl,
            },
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

    client.onRequest<ShowDocumentParams, ShowDocumentResult>(
        ShowDocumentRequest.method,
        async (params: ShowDocumentParams): Promise<ShowDocumentParams | ResponseError<ShowDocumentResult>> => {
            const uri = vscode.Uri.parse(params.uri)
            getLogger().info(`Processing ShowDocumentRequest for URI scheme: ${uri.scheme}`)
            try {
                if (uri.scheme.startsWith('http')) {
                    getLogger().info('Opening URL...')
                    await openUrl(vscode.Uri.parse(params.uri))
                } else {
                    getLogger().info('Opening text document...')
                    const doc = await vscode.workspace.openTextDocument(uri)
                    await vscode.window.showTextDocument(doc, { preview: false })
                }
                return params
            } catch (e) {
                return new ResponseError(
                    LSPErrorCodes.RequestFailed,
                    `Failed to process ShowDocumentRequest: ${(e as Error).message}`
                )
            }
        }
    )

    const sendProfileToLsp = async () => {
        try {
            const result = await client.sendRequest(updateConfigurationRequestType.method, {
                section: 'aws.q',
                settings: {
                    profileArn: AuthUtil.instance.regionProfileManager.activeRegionProfile?.arn,
                },
            })
            client.info(
                `Client: Updated Amazon Q Profile ${AuthUtil.instance.regionProfileManager.activeRegionProfile?.arn} to Amazon Q LSP`,
                result
            )
        } catch (err) {
            client.error('Error when setting Q Developer Profile to Amazon Q LSP', err)
        }
    }

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

        // send profile to lsp once.
        void sendProfileToLsp()

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

    // if (Experiments.instance.get('amazonqLSPInline', false)) {
    //     const inlineManager = new InlineCompletionManager(client)
    //     inlineManager.registerInlineCompletion()
    //     toDispose.push(
    //         inlineManager,
    //         Commands.register({ id: 'aws.amazonq.invokeInlineCompletion', autoconnect: true }, async () => {
    //             await vscode.commands.executeCommand('editor.action.inlineSuggest.trigger')
    //         }),
    //         vscode.workspace.onDidCloseTextDocument(async () => {
    //             await vscode.commands.executeCommand('aws.amazonq.rejectCodeSuggestion')
    //         })
    //     )
    // }
    if (Experiments.instance.get('amazonqChatLSP', true)) {
        await activateChat(client, encryptionKey, resourcePaths.ui)
    }

    toDispose.push(
        AuthUtil.instance.regionProfileManager.onDidChangeRegionProfile(sendProfileToLsp),
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
        // Set this inside onReady so that it only triggers on subsequent language server starts (not the first)
        onServerRestartHandler(client)
    )
}

/**
 * When the server restarts (likely due to a crash, then the LanguageClient automatically starts it again)
 * we need to run some server intialization again.
 */
function onServerRestartHandler(client: LanguageClient) {
    return client.onDidChangeState(async (e) => {
        // Ensure we are in a "restart" state
        if (!(e.oldState === State.Starting && e.newState === State.Running)) {
            return
        }

        // Emit telemetry that a crash was detected.
        // It is not guaranteed to 100% be a crash since somehow the server may have been intentionally restarted,
        // but most of the time it probably will have been due to a crash.
        // TODO: Port this metric override to common definitions
        telemetry.languageServer_crash.emit({ id: 'AmazonQ' })

        // Need to set the auth token in the again
        await AuthUtil.instance.restore()
    })
}

function getConfigSection(section: ConfigSection) {
    getLogger('amazonqLsp').debug('Fetching config section %s for language server', section)
    switch (section) {
        case 'aws.q':
            /**
             * IMPORTANT: This object is parsed by the following code in the language server, **so
             * it must match that expected shape**.
             * https://github.com/aws/language-servers/blob/1d2ca018f2248106690438b860d40a7ee67ac728/server/aws-lsp-codewhisperer/src/shared/amazonQServiceManager/configurationUtils.ts#L114
             */
            return [
                {
                    customization: undefinedIfEmpty(getSelectedCustomization().arn),
                    optOutTelemetry: getOptOutPreference() === 'OPTOUT',
                    projectContext: {
                        enableLocalIndexing: CodeWhispererSettings.instance.isLocalIndexEnabled(),
                        enableGpuAcceleration: CodeWhispererSettings.instance.isLocalIndexGPUEnabled(),
                        indexWorkerThreads: CodeWhispererSettings.instance.getIndexWorkerThreads(),
                        localIndexing: {
                            ignoreFilePatterns: CodeWhispererSettings.instance.getIndexIgnoreFilePatterns(),
                            maxFileSizeMB: CodeWhispererSettings.instance.getMaxIndexFileSize(),
                            maxIndexSizeMB: CodeWhispererSettings.instance.getMaxIndexSize(),
                            indexCacheDirPath: CodeWhispererSettings.instance.getIndexCacheDirPath(),
                        },
                    },
                },
            ]
        case 'aws.codeWhisperer':
            return [
                {
                    includeSuggestionsWithCodeReferences:
                        CodeWhispererSettings.instance.isSuggestionsWithCodeReferencesEnabled(),
                    shareCodeWhispererContentWithAWS: !CodeWhispererSettings.instance.isOptoutEnabled(),
                    includeImportsWithSuggestions: CodeWhispererSettings.instance.isImportRecommendationEnabled(),
                    sendUserWrittenCodeMetrics: true,
                },
            ]
        case 'aws.logLevel':
            return [toAmazonQLSPLogLevel(globals.logOutputChannel.logLevel)]
    }
}
