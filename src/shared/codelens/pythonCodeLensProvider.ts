/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { unlink, writeFile } from 'fs-extra'
import * as os from 'os'
import * as path from 'path'
import * as vscode from 'vscode'
import { PythonDebugConfiguration, PythonPathMapping } from '../../lambda/local/debugConfiguration'
import { CloudFormation } from '../cloudformation/cloudformation'
import { fileExists, readFileAsString } from '../filesystemUtilities'
import { LambdaHandlerCandidate } from '../lambdaHandlerSearch'
import { getLogger } from '../logger'
import { DefaultValidatingSamCliProcessInvoker } from '../sam/cli/defaultValidatingSamCliProcessInvoker'
import { DefaultSamLocalInvokeCommand, WAIT_FOR_DEBUGGER_MESSAGES } from '../sam/cli/samCliLocalInvoke'
import { SettingsConfiguration } from '../settingsConfiguration'
import { Datum, TelemetryNamespace } from '../telemetry/telemetryTypes'
import { registerCommand } from '../telemetry/telemetryUtils'
import { getChannelLogger, getDebugPort } from '../utilities/vsCodeUtils'
import {
    CodeLensProviderParams,
    DRIVE_LETTER_REGEX,
    getInvokeCmdKey,
    getMetricDatum,
    makeCodeLenses
} from './codeLensUtils'
import {
    executeSamBuild,
    getHandlerRelativePath,
    getLambdaInfoFromExistingTemplate,
    getRelativeFunctionHandler,
    invokeLambdaFunction,
    InvokeLambdaFunctionArguments,
    LambdaLocalInvokeParams,
    makeBuildDir,
    makeInputTemplate
} from './localLambdaRunner'

export const PYTHON_LANGUAGE = 'python'
export const PYTHON_ALLFILES: vscode.DocumentFilter[] = [
    {
        scheme: 'file',
        language: PYTHON_LANGUAGE
    }
]

// TODO: Fix this! Implement a more robust/flexible solution. This is just a basic minimal proof of concept.
const getSamProjectDirPathForFile = async (filepath: string): Promise<string> => {
    return path.dirname(filepath)
}

async function getLambdaHandlerCandidates({
    uri,
    pythonSettings
}: {
    uri: vscode.Uri
    pythonSettings: SettingsConfiguration
}): Promise<LambdaHandlerCandidate[]> {
    const PYTHON_JEDI_ENABLED_KEY = 'jediEnabled'
    const RETRY_INTERVAL_MS = 1000
    const MAX_RETRIES = 10

    const logger = getLogger()
    const filename = uri.fsPath

    let symbols: vscode.DocumentSymbol[] =
        (await vscode.commands.executeCommand<vscode.DocumentSymbol[]>('vscode.executeDocumentSymbolProvider', uri)) ||
        []

    // A recent regression in vscode-python stops codelenses from rendering if we first return an empty array
    // (because symbols have not yet been loaded), then a non-empty array (when our codelens provider is re-invoked
    // upon symbols loading). To work around this, we attempt to wait for symbols to load before returning. We cannot
    // distinguish between "the document does not contain any symbols" and "the symbols have not yet been loaded", so
    // we stop retrying if we are still getting an empty result after several retries.
    //
    // This issue only surfaces when the setting `python.jediEnabled` is not set to false.
    // TODO: When the above issue is resolved, remove this workaround AND bump the minimum
    //       required VS Code version and/or add a minimum supported version for the Python
    //       extension.
    const jediEnabled = pythonSettings.readSetting<boolean>(PYTHON_JEDI_ENABLED_KEY, true)
    if (jediEnabled) {
        for (let i = 0; i < MAX_RETRIES && !symbols.length; i++) {
            await new Promise<void>(resolve => setTimeout(resolve, RETRY_INTERVAL_MS))
            symbols =
                (await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                    'vscode.executeDocumentSymbolProvider',
                    uri
                )) || []
        }
    }

    return symbols
        .filter(sym => sym.kind === vscode.SymbolKind.Function)
        .map(symbol => {
            logger.debug(
                `pythonCodeLensProviderFound.getLambdaHandlerCandidates: ${JSON.stringify({
                    filePath: uri.fsPath,
                    handlerName: `${path.parse(filename).name}.${symbol.name}`
                })}`
            )

            return {
                filename,
                handlerName: `${path.parse(filename).name}.${symbol.name}`,
                range: symbol.range
            }
        })
}

// Add create debugging manifest/requirements.txt containing ptvsd
const makePythonDebugManifest = async (params: {
    samProjectCodeRoot: string
    outputDir: string
}): Promise<string | undefined> => {
    let manifestText = ''
    const manfestPath = path.join(params.samProjectCodeRoot, 'requirements.txt')
    if (await fileExists(manfestPath)) {
        manifestText = await readFileAsString(manfestPath)
    }
    getLogger().debug(`pythonCodeLensProvider.makePythonDebugManifest params: ${JSON.stringify(params, undefined, 2)}`)
    // TODO: Make this logic more robust. What if other module names include ptvsd?
    if (manifestText.indexOf('ptvsd') < 0) {
        manifestText += `${os.EOL}ptvsd>4.2,<5`
        const debugManifestPath = path.join(params.outputDir, 'debug-requirements.txt')
        await writeFile(debugManifestPath, manifestText)

        return debugManifestPath
    }
    // else we don't need to override the manifest. nothing to return
}

// tslint:disable:no-trailing-whitespace
const makeLambdaDebugFile = async (params: {
    handlerName: string
    debugPort: number
    outputDir: string
}): Promise<{ outFilePath: string; debugHandlerName: string }> => {
    if (!params.outputDir) {
        throw new Error('Must specify outputDir')
    }
    const logger = getLogger()

    const [handlerFilePrefix, handlerFunctionName] = params.handlerName.split('.')
    const debugHandlerFileName = `${handlerFilePrefix}___vsctk___debug`
    const debugHandlerFunctionName = 'lambda_handler'
    // TODO: Sanitize handlerFilePrefix, handlerFunctionName, debugHandlerFunctionName
    try {
        logger.debug('pythonCodeLensProvider.makeLambdaDebugFile params:', JSON.stringify(params, undefined, 2))
        const template = `
# Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

import ptvsd
import sys
from ${handlerFilePrefix} import ${handlerFunctionName} as _handler


def ${debugHandlerFunctionName}(event, context):
    ptvsd.enable_attach(address=('0.0.0.0', ${params.debugPort}), redirect_output=False)
    print('${WAIT_FOR_DEBUGGER_MESSAGES.PYTHON}')
    sys.stdout.flush()
    ptvsd.wait_for_attach()
    print('...debugger attached')
    sys.stdout.flush()
    return _handler(event, context)

`

        const outFilePath = path.join(params.outputDir, `${debugHandlerFileName}.py`)
        logger.debug('pythonCodeLensProvider.makeLambdaDebugFile outFilePath:', outFilePath)
        await writeFile(outFilePath, template)

        return {
            outFilePath,
            debugHandlerName: `${debugHandlerFileName}.${debugHandlerFunctionName}`
        }
    } catch (err) {
        logger.error('makeLambdaDebugFile failed:', err as Error)
        throw err
    }
}

export function getLocalRootVariants(filePath: string): string[] {
    if (process.platform === 'win32' && DRIVE_LETTER_REGEX.test(filePath)) {
        return [
            filePath.replace(DRIVE_LETTER_REGEX, match => match.toLowerCase()),
            filePath.replace(DRIVE_LETTER_REGEX, match => match.toUpperCase())
        ]
    }

    return [filePath]
}

function makeDebugConfig({
    debugPort,
    samProjectCodeRoot
}: {
    debugPort?: number
    samProjectCodeRoot: string
}): PythonDebugConfiguration {
    const pathMappings: PythonPathMapping[] = getLocalRootVariants(samProjectCodeRoot).map<PythonPathMapping>(
        variant => {
            return {
                localRoot: variant,
                remoteRoot: '/var/task'
            }
        }
    )

    return {
        type: PYTHON_LANGUAGE,
        request: 'attach',
        name: 'SamLocalDebug',
        host: 'localhost',
        port: debugPort!,
        pathMappings,
        // Disable redirectOutput to prevent the Python Debugger from automatically writing stdout/stderr text
        // to the Debug Console. We're taking the child process stdout/stderr and explicitly writing that to
        // the Debug Console.
        redirectOutput: false
    }
}

export async function initialize({
    configuration,
    outputChannel: toolkitOutputChannel,
    processInvoker = new DefaultValidatingSamCliProcessInvoker({}),
    telemetryService,
    localInvokeCommand
}: CodeLensProviderParams): Promise<void> {
    const logger = getLogger()
    const channelLogger = getChannelLogger(toolkitOutputChannel)

    if (!localInvokeCommand) {
        localInvokeCommand = new DefaultSamLocalInvokeCommand(channelLogger, [WAIT_FOR_DEBUGGER_MESSAGES.PYTHON])
    }

    const invokeLambda = async (args: LambdaLocalInvokeParams & { runtime: string }) => {
        // Switch over to the output channel so the user has feedback that we're getting things ready
        channelLogger.channel.show(true)

        channelLogger.info('AWS.output.sam.local.start', 'Preparing to run {0} locally...', args.handlerName)

        let lambdaDebugFilePath: string | undefined

        try {
            const samProjectCodeRoot = await getSamProjectDirPathForFile(args.document.uri.fsPath)
            const baseBuildDir = await makeBuildDir()

            let debugPort: number | undefined

            let handlerName: string = args.handlerName
            let manifestPath: string | undefined
            if (args.isDebug) {
                debugPort = await getDebugPort()
                const { debugHandlerName, outFilePath } = await makeLambdaDebugFile({
                    handlerName: args.handlerName,
                    debugPort: debugPort,
                    outputDir: samProjectCodeRoot
                })
                lambdaDebugFilePath = outFilePath
                handlerName = debugHandlerName
                manifestPath = await makePythonDebugManifest({
                    samProjectCodeRoot,
                    outputDir: baseBuildDir
                })
            }

            const handlerFileRelativePath = getHandlerRelativePath({
                codeRoot: samProjectCodeRoot,
                filePath: args.document.uri.fsPath
            })

            const relativeOriginalFunctionHandler = getRelativeFunctionHandler({
                handlerName: args.handlerName,
                runtime: args.runtime,
                handlerFileRelativePath
            })

            const relativeFunctionHandler = getRelativeFunctionHandler({
                handlerName: handlerName,
                runtime: args.runtime,
                handlerFileRelativePath
            })

            const lambdaInfo = await getLambdaInfoFromExistingTemplate({
                workspaceUri: args.workspaceFolder.uri,
                relativeOriginalFunctionHandler
            })

            const inputTemplatePath = await makeInputTemplate({
                baseBuildDir,
                codeDir: samProjectCodeRoot,
                relativeFunctionHandler,
                globals: lambdaInfo && lambdaInfo.templateGlobals ? lambdaInfo.templateGlobals : undefined,
                properties: lambdaInfo && lambdaInfo.resource.Properties ? lambdaInfo.resource.Properties : undefined,
                runtime: args.runtime
            })

            logger.debug(
                `pythonCodeLensProvider.invokeLambda: ${JSON.stringify(
                    { samProjectCodeRoot, inputTemplatePath, handlerName, manifestPath },
                    undefined,
                    2
                )}`
            )

            const codeDir = samProjectCodeRoot
            const samTemplatePath: string = await executeSamBuild({
                baseBuildDir,
                channelLogger,
                codeDir,
                inputTemplatePath,
                manifestPath,
                samProcessInvoker: processInvoker
            })

            const invokeArgs: InvokeLambdaFunctionArguments = {
                baseBuildDir,
                originalSamTemplatePath: args.samTemplate.fsPath,
                samTemplatePath,
                documentUri: args.document.uri,
                originalHandlerName: args.handlerName,
                handlerName,
                runtime: args.runtime
            }

            if (args.isDebug) {
                const debugConfig: PythonDebugConfiguration = makeDebugConfig({ debugPort, samProjectCodeRoot })
                invokeArgs.debugArgs = {
                    debugConfig,
                    debugPort: debugConfig.port
                }
            }

            await invokeLambdaFunction(invokeArgs, {
                channelLogger,
                configuration,
                samLocalInvokeCommand: localInvokeCommand!,
                telemetryService
            })
        } catch (err) {
            const error = err as Error
            channelLogger.error(
                'AWS.error.during.sam.local',
                'An error occurred trying to run SAM Application locally: {0}',
                error
            )
        } finally {
            if (lambdaDebugFilePath) {
                await deleteFile(lambdaDebugFilePath)
            }
        }
    }

    const command = getInvokeCmdKey('python')
    registerCommand({
        command,
        callback: async (params: LambdaLocalInvokeParams): Promise<{ datum: Datum }> => {
            const resource = await CloudFormation.getResourceFromTemplate({
                handlerName: params.handlerName,
                templatePath: params.samTemplate.fsPath
            })
            const runtime = CloudFormation.getRuntime(resource)

            await invokeLambda({
                runtime,
                ...params
            })

            return getMetricDatum({
                isDebug: params.isDebug,
                runtime
            })
        },
        telemetryName: {
            namespace: TelemetryNamespace.Lambda,
            name: 'invokelocal'
        }
    })
}

// Convenience method to swallow any errors
async function deleteFile(filePath: string): Promise<void> {
    try {
        await unlink(filePath)
    } catch (err) {
        getLogger().warn(err as Error)
    }
}

export async function makePythonCodeLensProvider(
    pythonSettings: SettingsConfiguration
): Promise<vscode.CodeLensProvider> {
    const logger = getLogger()

    return {
        // CodeLensProvider
        provideCodeLenses: async (
            document: vscode.TextDocument,
            token: vscode.CancellationToken
        ): Promise<vscode.CodeLens[]> => {
            const handlers: LambdaHandlerCandidate[] = await getLambdaHandlerCandidates({
                uri: document.uri,
                pythonSettings
            })
            logger.debug(
                'pythonCodeLensProvider.makePythonCodeLensProvider handlers:',
                JSON.stringify(handlers, undefined, 2)
            )

            return makeCodeLenses({
                document,
                handlers,
                token,
                language: 'python'
            })
        }
    }
}
