/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import * as vscode from 'vscode'

import { access } from 'fs-extra'
import { getHandlerConfig } from '../../lambda/config/templates'
import { makeCoreCLRDebugConfiguration } from '../../lambda/local/debugConfiguration'
import { DefaultDockerClient, DockerClient } from '../clients/dockerClient'
import { CloudFormation } from '../cloudformation/cloudformation'
import { mkdir } from '../filesystem'
import { LambdaHandlerCandidate } from '../lambdaHandlerSearch'
import { getLogger } from '../logger'
import { DefaultSamCliProcessInvoker } from '../sam/cli/samCliInvoker'
import { SamCliProcessInvoker } from '../sam/cli/samCliInvokerUtils'
import {
    DefaultSamLocalInvokeCommand,
    SamLocalInvokeCommand,
    WAIT_FOR_DEBUGGER_MESSAGES
} from '../sam/cli/samCliLocalInvoke'
import { SettingsConfiguration } from '../settingsConfiguration'
import { recordLambdaInvokeLocal, Result, Runtime } from '../telemetry/telemetry'
import { TelemetryService } from '../telemetry/telemetryService'
import { dirnameWithTrailingSlash } from '../utilities/pathUtils'
import { ChannelLogger, getChannelLogger, getDebugPort } from '../utilities/vsCodeUtils'
import { CodeLensProviderParams, getInvokeCmdKey, makeCodeLenses } from './codeLensUtils'
import {
    executeSamBuild,
    ExecuteSamBuildArguments,
    invokeLambdaFunction,
    InvokeLambdaFunctionArguments,
    InvokeLambdaFunctionContext,
    LambdaLocalInvokeParams,
    makeBuildDir,
    makeInputTemplate,
    waitForDebugPort
} from './localLambdaRunner'

export const CSHARP_LANGUAGE = 'csharp'
export const CSHARP_ALLFILES: vscode.DocumentFilter[] = [
    {
        scheme: 'file',
        language: CSHARP_LANGUAGE
    }
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

export async function initialize({
    context,
    configuration,
    outputChannel: toolkitOutputChannel,
    processInvoker = new DefaultSamCliProcessInvoker(),
    telemetryService,
    localInvokeCommand = new DefaultSamLocalInvokeCommand(getChannelLogger(toolkitOutputChannel), [
        WAIT_FOR_DEBUGGER_MESSAGES.DOTNET
    ])
}: CodeLensProviderParams): Promise<void> {
    context.subscriptions.push(vscode.commands.registerCommand(getInvokeCmdKey(CSHARP_LANGUAGE), async (params: LambdaLocalInvokeParams) => {
        await onLocalInvokeCommand({
            lambdaLocalInvokeParams: params,
            configuration,
            toolkitOutputChannel,
            processInvoker,
            localInvokeCommand,
            telemetryService
        })
    }))
}

export interface OnLocalInvokeCommandContext {
    installDebugger(args: InstallDebuggerArgs): Promise<InstallDebuggerResult>
}

class DefaultOnLocalInvokeCommandContext implements OnLocalInvokeCommandContext {
    private readonly dockerClient: DockerClient

    public constructor(outputChannel: vscode.OutputChannel) {
        this.dockerClient = new DefaultDockerClient(outputChannel)
    }

    public async installDebugger(args: InstallDebuggerArgs): Promise<InstallDebuggerResult> {
        return await _installDebugger(args, { dockerClient: this.dockerClient })
    }
}

function getCodeUri(resource: CloudFormation.Resource, samTemplateUri: vscode.Uri) {
    const rawCodeUri = CloudFormation.getCodeUri(resource)

    return path.isAbsolute(rawCodeUri) ? rawCodeUri : path.join(path.dirname(samTemplateUri.fsPath), rawCodeUri)
}

/**
 * The command that is run when user clicks on Run Local or Debug Local CodeLens
 * Accepts object containing the following params:
 * @param configuration - SettingsConfiguration (for invokeLambdaFunction)
 * @param toolkitOutputChannel - "AWS Toolkit" output channel
 * @param commandName - Name of the VS Code Command currently running
 * @param lambdaLocalInvokeParams - Information about the Lambda Handler to invoke locally
 * @param processInvoker - SAM CLI Process invoker
 * @param taskInvoker - SAM CLI Task invoker
 * @param telemetryService - Telemetry service for metrics
 */
async function onLocalInvokeCommand(
    {
        configuration,
        toolkitOutputChannel,
        lambdaLocalInvokeParams,
        processInvoker,
        localInvokeCommand,
        telemetryService,
        loadCloudFormationTemplate = async _args => await CloudFormation.load(_args),
        getResourceFromTemplateResource = async _args => await CloudFormation.getResourceFromTemplateResources(_args)
    }: {
        configuration: SettingsConfiguration
        toolkitOutputChannel: vscode.OutputChannel
        lambdaLocalInvokeParams: LambdaLocalInvokeParams
        processInvoker: SamCliProcessInvoker
        localInvokeCommand: SamLocalInvokeCommand
        telemetryService: TelemetryService
        loadCloudFormationTemplate?(filename: string): Promise<CloudFormation.Template>
        getResourceFromTemplateResource?(args: {
            templateResources?: CloudFormation.TemplateResources
            handlerName: string
        }): Promise<CloudFormation.Resource>
    },
    context: OnLocalInvokeCommandContext = new DefaultOnLocalInvokeCommandContext(toolkitOutputChannel)
): Promise<void> {
    const channelLogger = getChannelLogger(toolkitOutputChannel)
    const template: CloudFormation.Template = await loadCloudFormationTemplate(
        lambdaLocalInvokeParams.samTemplate.fsPath
    )
    const resource = await getResourceFromTemplateResource({
        templateResources: template.Resources,
        handlerName: lambdaLocalInvokeParams.handlerName
    })
    let invokeResult: Result = 'Succeeded'
    const lambdaRuntime = CloudFormation.getRuntime(resource)

    try {
        // Switch over to the output channel so the user has feedback that we're getting things ready
        channelLogger.channel.show(true)
        channelLogger.info(
            'AWS.output.sam.local.start',
            'Preparing to run {0} locally...',
            lambdaLocalInvokeParams.handlerName
        )

        const baseBuildDir = await makeBuildDir()
        const codeUri = getCodeUri(resource, lambdaLocalInvokeParams.samTemplate)
        const documentUri = lambdaLocalInvokeParams.document.uri
        const handlerName = lambdaLocalInvokeParams.handlerName

        const inputTemplatePath = await makeInputTemplate({
            baseBuildDir,
            codeDir: codeUri,
            relativeFunctionHandler: handlerName,
            runtime: lambdaRuntime,
            globals: template.Globals,
            properties: resource.Properties
        })

        const config =  await getHandlerConfig({
            handlerName: handlerName,
            documentUri: documentUri,
            samTemplate: vscode.Uri.file(lambdaLocalInvokeParams.samTemplate.fsPath)
        })

        const buildArgs: ExecuteSamBuildArguments = {
            baseBuildDir,
            channelLogger,
            codeDir: codeUri,
            inputTemplatePath,
            samProcessInvoker: processInvoker,
            useContainer: config.useContainer
        }
        if (lambdaLocalInvokeParams.isDebug) {
            buildArgs.environmentVariables = {
                SAM_BUILD_MODE: 'debug'
            }
        }
        const samTemplatePath: string = await executeSamBuild(buildArgs)

        const invokeArgs: InvokeLambdaFunctionArguments = {
            baseBuildDir,
            documentUri,
            originalHandlerName: handlerName,
            handlerName,
            originalSamTemplatePath: lambdaLocalInvokeParams.samTemplate.fsPath,
            samTemplatePath,
            runtime: lambdaRuntime
        }

        const invokeContext: InvokeLambdaFunctionContext = {
            channelLogger,
            configuration,
            samLocalInvokeCommand: localInvokeCommand,
            telemetryService
        }

        if (!lambdaLocalInvokeParams.isDebug) {
            await invokeLambdaFunction(invokeArgs, invokeContext)
        } else {
            const { debuggerPath } = await context.installDebugger({
                lambdaRuntime: lambdaRuntime,
                targetFolder: codeUri,
                channelLogger
            })
            const port = await getDebugPort()
            const debugConfig = makeCoreCLRDebugConfiguration({
                port,
                codeUri
            })

            await invokeLambdaFunction(
                {
                    ...invokeArgs,
                    debugArgs: {
                        debugConfig,
                        debugPort: port,
                        debuggerPath
                    }
                },
                {
                    channelLogger,
                    configuration,
                    samLocalInvokeCommand: localInvokeCommand,
                    telemetryService,
                    onWillAttachDebugger: waitForDebugPort
                }
            )
        }
    } catch (err) {
        invokeResult = 'Failed'
        channelLogger.error(
            'AWS.error.during.sam.local',
            'An error occurred trying to run SAM Application locally: {0}',
            err as Error
        )
    } finally {
        recordLambdaInvokeLocal({
            result: invokeResult,
            runtime: lambdaRuntime as Runtime,
            debug: lambdaLocalInvokeParams.isDebug
        })
    }
}

export async function makeCSharpCodeLensProvider(): Promise<vscode.CodeLensProvider> {
    const logger = getLogger()

    const codeLensProvider: vscode.CodeLensProvider = {
        provideCodeLenses: async (
            document: vscode.TextDocument,
            token: vscode.CancellationToken
        ): Promise<vscode.CodeLens[]> => {
            const handlers: LambdaHandlerCandidate[] = await getLambdaHandlerCandidates(document)
            logger.debug(
                'csharpCodeLensProvider.makeCSharpCodeLensProvider handlers:',
                JSON.stringify(handlers, undefined, 2)
            )

            return makeCodeLenses({
                document,
                handlers,
                token,
                language: 'csharp'
            })
        }
    }

    return codeLensProvider
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
                range: lambdaHandlerComponents.handlerRange
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
                                class: classSymbol
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
                                handlerRange: methodSymbol.range
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
    lambdaRuntime: string
    targetFolder: string
    channelLogger: ChannelLogger
}

interface InstallDebuggerResult {
    debuggerPath: string
}

function getDebuggerPath(parentFolder: string): string {
    return path.resolve(parentFolder, '.vsdbg')
}

async function ensureDebuggerPathExists(parentFolder: string): Promise<void> {
    const vsdbgPath = getDebuggerPath(parentFolder)

    try {
        await access(vsdbgPath)
    } catch {
        await mkdir(vsdbgPath)
    }
}

async function _installDebugger(
    { lambdaRuntime, targetFolder, channelLogger }: InstallDebuggerArgs,
    { dockerClient }: { dockerClient: DockerClient }
): Promise<InstallDebuggerResult> {
    await ensureDebuggerPathExists(targetFolder)

    try {
        const vsdbgPath = getDebuggerPath(targetFolder)

        channelLogger.info(
            'AWS.samcli.local.invoke.debugger.install',
            'Installing .NET Core Debugger to {0}...',
            vsdbgPath
        )

        await dockerClient.invoke({
            command: 'run',
            image: `lambci/lambda:${lambdaRuntime}`,
            removeOnExit: true,
            mount: {
                type: 'bind',
                source: vsdbgPath,
                destination: '/vsdbg'
            },
            entryPoint: {
                command: 'bash',
                args: ['-c', 'curl -sSL https://aka.ms/getvsdbgsh | bash /dev/stdin -v latest -l /vsdbg']
            }
        })

        return { debuggerPath: vsdbgPath }
    } catch (err) {
        channelLogger.info(
            'AWS.samcli.local.invoke.debugger.install.failed',
            'Error installing .NET Core Debugger: {0}',
            err instanceof Error ? (err as Error) : String(err)
        )

        throw err
    }
}
