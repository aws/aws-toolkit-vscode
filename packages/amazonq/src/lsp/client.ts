/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import vscode, { env, version } from 'vscode'
import * as nls from 'vscode-nls'
import { LanguageClient, LanguageClientOptions, RequestType, State } from 'vscode-languageclient'
import { InlineCompletionManager } from '../app/inline/completion'
import { AmazonQLspAuth, encryptionKey, notificationTypes } from './auth'
import {
    CreateFilesParams,
    DeleteFilesParams,
    DidChangeWorkspaceFoldersParams,
    DidSaveTextDocumentParams,
    GetConfigurationFromServerParams,
    RenameFilesParams,
    ResponseMessage,
    updateConfigurationRequestType,
    WorkspaceFolder,
} from '@aws/language-server-runtimes/protocol'
import { AuthUtil, CodeWhispererSettings, getSelectedCustomization } from 'aws-core-vscode/codewhisperer'
import {
    Settings,
    createServerOptions,
    globals,
    Experiments,
    Commands,
    oneSecond,
    validateNodeExe,
    getLogger,
    undefinedIfEmpty,
    getOptOutPreference,
    isAmazonInternalOs,
    fs,
    getClientId,
} from 'aws-core-vscode/shared'
import { processUtils } from 'aws-core-vscode/shared'
import { activate } from './chat/activation'
import { AmazonQResourcePaths } from './lspInstaller'
import { ConfigSection, isValidConfigSection, toAmazonQLSPLogLevel } from './config'
import { telemetry } from 'aws-core-vscode/telemetry'

const localize = nls.loadMessageBundle()
const logger = getLogger('amazonqLsp.lspClient')

export async function hasGlibcPatch(): Promise<boolean> {
    return await fs.exists('/opt/vsc-sysroot/lib64/ld-linux-x86-64.so.2')
}

export async function startLanguageServer(
    extensionContext: vscode.ExtensionContext,
    resourcePaths: AmazonQResourcePaths
) {
    logger.debug('starting amazon q language server')
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

    const clientId = 'amazonq'
    const traceServerEnabled = Settings.instance.isSet(`${clientId}.trace.server`)
    let executable: string[] = []
    // apply the GLIBC 2.28 path to node js runtime binary
    if (isAmazonInternalOs() && (await hasGlibcPatch())) {
        executable = [
            '/opt/vsc-sysroot/lib64/ld-linux-x86-64.so.2',
            '--library-path',
            '/opt/vsc-sysroot/lib64',
            resourcePaths.node,
        ]
        getLogger('amazonqLsp').info(`Patched node runtime with GLIBC to ${executable}`)
    } else {
        executable = [resourcePaths.node]
    }

    logger.debug('creating the server options')

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
                        name: 'AmazonQ-For-VSCode',
                        version: '0.0.1',
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
                    workspaceIdentifier: extensionContext.storageUri,
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

    const client = new LanguageClient(
        clientId,
        localize('amazonq.server.name', 'Amazon Q Language Server'),
        serverOptions,
        clientOptions
    )

    const disposable = client.start()
    toDispose.push(disposable)

    const auth = new AmazonQLspAuth(client)

    logger.debug('waiting for the client to be ready')
    return client.onReady().then(async () => {
        logger.debug('client is ready')
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

        if (Experiments.instance.get('amazonqChatLSP', true)) {
            await activate(client, encryptionKey, resourcePaths.ui)
        }

        const refreshInterval = auth.startTokenRefreshInterval(10 * oneSecond)

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

        // send profile to lsp once.
        void sendProfileToLsp()

        toDispose.push(
            AuthUtil.instance.auth.onDidChangeActiveConnection(async () => {
                await auth.refreshConnection()
            }),
            AuthUtil.instance.auth.onDidDeleteConnection(async () => {
                client.sendNotification(notificationTypes.deleteBearerToken.method)
            }),
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
            { dispose: () => clearInterval(refreshInterval) },
            // Set this inside onReady so that it only triggers on subsequent language server starts (not the first)
            onServerRestartHandler(client, auth)
        )
    })
}

/**
 * When the server restarts (likely due to a crash, then the LanguageClient automatically starts it again)
 * we need to run some server intialization again.
 */
function onServerRestartHandler(client: LanguageClient, auth: AmazonQLspAuth) {
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
        await auth.refreshConnection(true)
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
                },
            ]
        case 'aws.logLevel':
            return [toAmazonQLSPLogLevel(globals.logOutputChannel.logLevel)]
    }
}
