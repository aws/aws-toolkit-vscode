/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { access } from 'fs-extra'
import * as path from 'path'
import * as vscode from 'vscode'
import * as os from 'os'
import {
    DotNetCoreDebugConfiguration,
    DOTNET_CORE_DEBUGGER_PATH,
    getCodeRoot,
    getTemplate,
    getTemplateResource,
} from '../../lambda/local/debugConfiguration'
import { RuntimeFamily } from '../../lambda/models/samLambdaRuntime'
import * as pathutil from '../../shared/utilities/pathUtils'
import { DefaultDockerClient, DockerClient } from '../clients/dockerClient'
import { ExtContext } from '../extensions'
import { mkdir } from '../filesystem'
import { LambdaHandlerCandidate } from '../lambdaHandlerSearch'
import { DefaultSamCliProcessInvoker } from '../sam/cli/samCliInvoker'
import { DefaultSamLocalInvokeCommand, WAIT_FOR_DEBUGGER_MESSAGES } from '../sam/cli/samCliLocalInvoke'
import { SamLaunchRequestArgs } from '../sam/debugger/samDebugSession'
import { recordLambdaInvokeLocal, Result, Runtime } from '../telemetry/telemetry'
import { getStartPort } from '../utilities/debuggerUtils'
import { dirnameWithTrailingSlash } from '../utilities/pathUtils'
import { ChannelLogger, getChannelLogger } from '../utilities/vsCodeUtils'
import {
    executeSamBuild,
    ExecuteSamBuildArguments,
    invokeLambdaFunction,
    makeBuildDir,
    makeInputTemplate,
    waitForDebugPort,
} from './localLambdaRunner'

export const CSHARP_LANGUAGE = 'csharp'
export const CSHARP_ALLFILES: vscode.DocumentFilter[] = [
    {
        scheme: 'file',
        language: CSHARP_LANGUAGE,
    },
]

const REGEXP_RESERVED_WORD_PUBLIC = /\bpublic\b/

export interface DotNetLambdaHandlerComponents {
    assembly: string
    namespace: string
    class: string
    method: string
    // Range of the function representing the Lambda Handler
    handlerRange: vscode.Range
}

export interface OnLocalInvokeCommandContext {
    installDebugger(args: InstallDebuggerArgs): Promise<void>
}

class DefaultOnLocalInvokeCommandContext implements OnLocalInvokeCommandContext {
    private readonly dockerClient: DockerClient

    public constructor(outputChannel: vscode.OutputChannel) {
        this.dockerClient = new DefaultDockerClient(outputChannel)
    }

    public async installDebugger(args: InstallDebuggerArgs): Promise<void> {
        await _installDebugger(args, { dockerClient: this.dockerClient })
    }
}

/**
 * Gathers and sets launch-config info by inspecting the workspace and creating
 * temp files/directories as needed.
 *
 * Does NOT execute/invoke SAM, docker, etc.
 */
export async function makeCsharpConfig(config: SamLaunchRequestArgs): Promise<SamLaunchRequestArgs> {
    // TODO: walk the tree to find .sln, .csproj ...
    if (!config.codeRoot) {
        // Last-resort attempt to discover the project root (when there is no
        // `launch.json` nor `template.yaml`).
        config.codeRoot = getSamProjectDirPathForFile(config?.samTemplatePath ?? config.documentUri!!.fsPath)
        if (!config.codeRoot) {
            // TODO: return error and show it at the caller.
            throw Error('missing launch.json, template.yaml, and failed to discover project root')
        }
    }
    config.codeRoot = pathutil.normalize(config.codeRoot)

    const baseBuildDir = await makeBuildDir()
    const template = getTemplate(config)
    const resource = getTemplateResource(config)
    const codeUri = getCodeRoot(config.workspaceFolder, config)
    const handlerName = config.handlerName

    config.samTemplatePath = await makeInputTemplate({
        baseBuildDir,
        codeDir: codeUri!!,
        relativeFunctionHandler: handlerName,
        runtime: config.runtime,
        globals: template?.Globals,
        properties: resource?.Properties,
    })

    config = {
        ...config,
        type: 'coreclr',
        request: 'attach',
        runtimeFamily: RuntimeFamily.DotNetCore,
        name: 'SamLocalDebug',
        baseBuildDir: baseBuildDir,
    }

    if (!config.noDebug) {
        config = await makeCoreCLRDebugConfiguration(config, config.codeRoot)
    }

    return config
}

/**
 * Launches and attaches debugger to a SAM dotnet (csharp) project.
 */
export async function invokeCsharpLambda(ctx: ExtContext, config: SamLaunchRequestArgs): Promise<void> {
    const invokeCtx: OnLocalInvokeCommandContext = new DefaultOnLocalInvokeCommandContext(ctx.outputChannel)
    const processInvoker = new DefaultSamCliProcessInvoker()
    const localInvokeCommand = new DefaultSamLocalInvokeCommand(getChannelLogger(ctx.outputChannel), [
        WAIT_FOR_DEBUGGER_MESSAGES.DOTNET,
    ])
    let invokeResult: Result = 'Succeeded'

    try {
        // Switch over to the output channel so the user has feedback that we're getting things ready
        ctx.chanLogger.channel.show(true)
        ctx.chanLogger.info('AWS.output.sam.local.start', 'Preparing to run {0} locally...', config.handlerName)

        const buildArgs: ExecuteSamBuildArguments = {
            baseBuildDir: config.baseBuildDir!!,
            channelLogger: ctx.chanLogger,
            codeDir: path.dirname(config.samTemplatePath),
            inputTemplatePath: config.samTemplatePath,
            samProcessInvoker: processInvoker,
            useContainer: config.sam?.containerBuild,
        }
        if (!config.noDebug) {
            buildArgs.environmentVariables = {
                SAM_BUILD_MODE: 'debug',
            }
        }

        // XXX: reassignment
        config.samTemplatePath = await executeSamBuild(buildArgs)
        if (config.invokeTarget.target === 'template') {
            // XXX: reassignment
            config.invokeTarget.samTemplatePath = config.samTemplatePath
        }

        if (!config.noDebug) {
            await invokeCtx.installDebugger({
                debuggerPath: config.debuggerPath!!,
                lambdaRuntime: config.runtime,
                channelLogger: ctx.chanLogger,
            })
            config.onWillAttachDebugger = waitForDebugPort
            config.samLocalInvokeCommand = localInvokeCommand
        }

        await invokeLambdaFunction(ctx, config)
    } catch (err) {
        invokeResult = 'Failed'
        ctx.chanLogger.error(
            'AWS.error.during.sam.local',
            'An error occurred trying to run SAM Application locally: {0}',
            err as Error
        )
    } finally {
        recordLambdaInvokeLocal({
            result: invokeResult,
            runtime: config.runtime as Runtime,
            debug: !config.noDebug,
        })
    }
}

export async function getLambdaHandlerCandidates(document: vscode.TextDocument): Promise<LambdaHandlerCandidate[]> {
    const assemblyName = await getAssemblyName(document.uri)
    if (!assemblyName) {
        return []
    }

    const symbols: vscode.DocumentSymbol[] =
        (await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
            'vscode.executeDocumentSymbolProvider',
            document.uri
        )) || []

    return getLambdaHandlerComponents(document, symbols, assemblyName).map<LambdaHandlerCandidate>(
        lambdaHandlerComponents => {
            const handlerName = generateDotNetLambdaHandler(lambdaHandlerComponents)

            return {
                filename: document.uri.fsPath,
                handlerName,
                range: lambdaHandlerComponents.handlerRange,
            }
        }
    )
}

async function getAssemblyName(sourceCodeUri: vscode.Uri): Promise<string | undefined> {
    const projectFile: vscode.Uri | undefined = await findParentProjectFile(sourceCodeUri)

    if (!projectFile) {
        return undefined
    }

    // TODO : Perform an XPATH parse on the project file
    // If Project/PropertyGroup/AssemblyName exists, use that. Otherwise use the file name.

    return path.parse(projectFile.fsPath).name
}

export function getLambdaHandlerComponents(
    document: vscode.TextDocument,
    symbols: vscode.DocumentSymbol[],
    assembly: string
): DotNetLambdaHandlerComponents[] {
    return (
        symbols
            .filter(symbol => symbol.kind === vscode.SymbolKind.Namespace)
            // Find relevant classes within the namespace
            .reduce<
                {
                    namespace: vscode.DocumentSymbol
                    class: vscode.DocumentSymbol
                }[]
            >((accumulator, namespaceSymbol: vscode.DocumentSymbol) => {
                accumulator.push(
                    ...namespaceSymbol.children
                        .filter(namespaceChildSymbol => namespaceChildSymbol.kind === vscode.SymbolKind.Class)
                        .filter(classSymbol => isPublicClassSymbol(document, classSymbol))
                        .map(classSymbol => {
                            return {
                                namespace: namespaceSymbol,
                                class: classSymbol,
                            }
                        })
                )

                return accumulator
            }, [])
            // Find relevant methods within each class
            .reduce<DotNetLambdaHandlerComponents[]>((accumulator, lambdaHandlerComponents) => {
                accumulator.push(
                    ...lambdaHandlerComponents.class.children
                        .filter(classChildSymbol => classChildSymbol.kind === vscode.SymbolKind.Method)
                        .filter(methodSymbol => isPublicMethodSymbol(document, methodSymbol))
                        .map(methodSymbol => {
                            return {
                                assembly,
                                namespace: lambdaHandlerComponents.namespace.name,
                                class: document.getText(lambdaHandlerComponents.class.selectionRange),
                                method: document.getText(methodSymbol.selectionRange),
                                handlerRange: methodSymbol.range,
                            }
                        })
                )

                return accumulator
            }, [])
    )
}

export async function findParentProjectFile(
    sourceCodeUri: vscode.Uri,
    findWorkspaceFiles: typeof vscode.workspace.findFiles = vscode.workspace.findFiles
): Promise<vscode.Uri | undefined> {
    const workspaceProjectFiles: vscode.Uri[] = await findWorkspaceFiles('**/*.csproj')

    // Use the project file "closest" in the parent chain to sourceCodeUri
    // Assumption: only one .csproj file will exist in a given folder
    const parentProjectFiles = workspaceProjectFiles
        .filter(uri => {
            const dirname = dirnameWithTrailingSlash(uri.fsPath)

            return sourceCodeUri.fsPath.startsWith(dirname)
        })
        .sort()
        .reverse()

    return parentProjectFiles.length === 0 ? undefined : parentProjectFiles[0]
}

export function isPublicClassSymbol(
    document: Pick<vscode.TextDocument, 'getText'>,
    symbol: vscode.DocumentSymbol
): boolean {
    if (symbol.kind === vscode.SymbolKind.Class) {
        // from "public class Processor" pull "public class "
        const classDeclarationBeforeNameRange = new vscode.Range(symbol.range.start, symbol.selectionRange.start)
        const classDeclarationBeforeName: string = document.getText(classDeclarationBeforeNameRange)

        return REGEXP_RESERVED_WORD_PUBLIC.test(classDeclarationBeforeName)
    }

    return false
}

export function isPublicMethodSymbol(
    document: Pick<vscode.TextDocument, 'getText'>,
    symbol: vscode.DocumentSymbol
): boolean {
    if (symbol.kind === vscode.SymbolKind.Method) {
        // from "public async Task<Response> foo()" pull "public async Task<Response> "
        const signatureBeforeMethodNameRange = new vscode.Range(symbol.range.start, symbol.selectionRange.start)
        const signatureBeforeMethodName: string = document.getText(signatureBeforeMethodNameRange)

        return REGEXP_RESERVED_WORD_PUBLIC.test(signatureBeforeMethodName)
    }

    return false
}

export function generateDotNetLambdaHandler(components: DotNetLambdaHandlerComponents): string {
    return `${components.assembly}::${components.namespace}.${components.class}::${components.method}`
}

interface InstallDebuggerArgs {
    debuggerPath: string
    lambdaRuntime: string
    channelLogger: ChannelLogger
}

function getDebuggerPath(parentFolder: string): string {
    return path.resolve(parentFolder, '.vsdbg')
}

async function ensureDebuggerPathExists(debuggerPath: string): Promise<void> {
    try {
        await access(debuggerPath)
    } catch {
        await mkdir(debuggerPath)
    }
}

async function _installDebugger(
    { debuggerPath, lambdaRuntime, channelLogger }: InstallDebuggerArgs,
    { dockerClient }: { dockerClient: DockerClient }
): Promise<void> {
    await ensureDebuggerPathExists(debuggerPath)

    try {
        channelLogger.info(
            'AWS.samcli.local.invoke.debugger.install',
            'Installing .NET Core Debugger to {0}...',
            debuggerPath
        )

        await dockerClient.invoke({
            command: 'run',
            image: `lambci/lambda:${lambdaRuntime}`,
            removeOnExit: true,
            mount: {
                type: 'bind',
                source: debuggerPath,
                destination: '/vsdbg',
            },
            entryPoint: {
                command: 'bash',
                args: ['-c', 'curl -sSL https://aka.ms/getvsdbgsh | bash /dev/stdin -v latest -l /vsdbg'],
            },
        })
    } catch (err) {
        channelLogger.info(
            'AWS.samcli.local.invoke.debugger.install.failed',
            'Error installing .NET Core Debugger: {0}',
            err instanceof Error ? (err as Error) : String(err)
        )

        throw err
    }
}

function getSamProjectDirPathForFile(filepath: string): string {
    return pathutil.normalize(path.dirname(filepath))
}

/**
 * Creates a CLR launch-config composed with the given `config`.
 */
export async function makeCoreCLRDebugConfiguration(
    config: SamLaunchRequestArgs,
    codeUri: string
): Promise<DotNetCoreDebugConfiguration> {
    if (!!config.noDebug) {
        throw Error(`SAM debug: invalid config ${config}`)
    }
    config.debugPort = config.debugPort ?? (await getStartPort())
    const pipeArgs = ['-c', `docker exec -i $(docker ps -q -f publish=${config.debugPort}) \${debuggerCommand}`]
    config.debuggerPath = pathutil.normalize(getDebuggerPath(config.codeRoot))
    await ensureDebuggerPathExists(config.debuggerPath)

    if (os.platform() === 'win32') {
        // Coerce drive letter to uppercase. While Windows is case-insensitive, sourceFileMap is case-sensitive.
        codeUri = codeUri.replace(pathutil.DRIVE_LETTER_REGEX, match => match.toUpperCase())
    }

    return {
        ...config,
        name: 'SamLocalDebug',
        runtimeFamily: RuntimeFamily.DotNetCore,
        request: 'attach',
        processId: '1',
        pipeTransport: {
            pipeProgram: 'sh',
            pipeArgs,
            debuggerPath: DOTNET_CORE_DEBUGGER_PATH,
            pipeCwd: codeUri,
        },
        windows: {
            pipeTransport: {
                pipeProgram: 'powershell',
                pipeArgs,
                debuggerPath: DOTNET_CORE_DEBUGGER_PATH,
                pipeCwd: codeUri,
            },
        },
        sourceFileMap: {
            ['/var/task']: codeUri,
        },
    }
}
