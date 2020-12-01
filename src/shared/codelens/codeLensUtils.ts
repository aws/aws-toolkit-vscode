/*!
 * Copyright 2018-2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

import { nodeJsRuntimes, RuntimeFamily } from '../../lambda/models/samLambdaRuntime'
import { CloudFormation } from '../cloudformation/cloudformation'
import { getResourcesForHandler } from '../cloudformation/templateRegistry'
import { LambdaHandlerCandidate } from '../lambdaHandlerSearch'
import { getLogger } from '../logger'
import { API_TARGET_TYPE, CODE_TARGET_TYPE, TEMPLATE_TARGET_TYPE } from '../sam/debugger/awsSamDebugConfiguration'
import {
    addSamDebugConfiguration,
    AddSamDebugConfigurationInput,
} from '../sam/debugger/commands/addSamDebugConfiguration'
import { LambdaLocalInvokeParams } from '../sam/localLambdaRunner'
import { recordLambdaInvokeLocal, Result, Runtime } from '../telemetry/telemetry'
import { localize } from '../utilities/vsCodeUtils'
import * as pythonDebug from '../sam/debugger/pythonSamDebug'
import { createQuickPick, promptUser, verifySinglePickerOutput } from '../ui/picker'
import { getWorkspaceRelativePath } from '../utilities/workspaceUtils'
import * as pythonCodelens from './pythonCodeLensProvider'
import * as csharpCodelens from './csharpCodeLensProvider'
import * as tsCodelens from './typescriptCodeLensProvider'
import { ExtContext } from '../extensions'

export type Language = 'python' | 'javascript' | 'csharp'

export async function makeCodeLenses({
    document,
    token,
    handlers,
    runtimeFamily,
}: {
    document: vscode.TextDocument
    token: vscode.CancellationToken
    handlers: LambdaHandlerCandidate[]
    runtimeFamily: RuntimeFamily
}): Promise<vscode.CodeLens[]> {
    const workspaceFolder: vscode.WorkspaceFolder | undefined = vscode.workspace.getWorkspaceFolder(document.uri)

    if (!workspaceFolder) {
        throw new Error(`Source file ${document.uri} is external to the current workspace.`)
    }

    const lenses: vscode.CodeLens[] = []
    for (const handler of handlers) {
        // handler.range is a RangeOrCharOffset union type. Extract vscode.Range.
        const range =
            handler.range instanceof vscode.Range
                ? handler.range
                : new vscode.Range(
                      document.positionAt(handler.range.positionStart),
                      document.positionAt(handler.range.positionEnd)
                  )

        try {
            const associatedResources = getResourcesForHandler(handler.filename, handler.handlerName)
            const templateConfigs: AddSamDebugConfigurationInput[] = []

            if (associatedResources.length > 0) {
                for (const resource of associatedResources) {
                    templateConfigs.push({
                        resourceName: resource.name,
                        rootUri: vscode.Uri.file(resource.templateDatum.path),
                    })
                    const events = resource.resourceData.Properties?.Events
                    if (events) {
                        // Check for api events
                        for (const key in events) {
                            const value = events[key]
                            if (value.Type === 'Api') {
                                templateConfigs.push({
                                    resourceName: resource.name,
                                    rootUri: vscode.Uri.file(resource.templateDatum.path),
                                    apiEvent: { name: key, event: value },
                                })
                            }
                        }
                    }
                }
            }
            const codeConfig: AddSamDebugConfigurationInput = {
                resourceName: handler.handlerName,
                rootUri: handler.manifestUri,
                runtimeFamily,
            }
            lenses.push(makeAddCodeSamDebugCodeLens(range, codeConfig, templateConfigs))
        } catch (err) {
            getLogger().error(
                `Could not generate 'configure' code lens for handler '${handler.handlerName}': %O`,
                err as Error
            )
        }
    }

    return lenses
}

export function getInvokeCmdKey(language: Language) {
    return `aws.lambda.local.invoke.${language}`
}

function makeAddCodeSamDebugCodeLens(
    range: vscode.Range,
    codeConfig: AddSamDebugConfigurationInput,
    templateConfigs: AddSamDebugConfigurationInput[]
): vscode.CodeLens {
    const command: vscode.Command = {
        title: localize('AWS.command.addSamDebugConfiguration', 'Add Debug Configuration'),
        command: 'aws.pickAddSamDebugConfiguration',
        // Values provided by makeTypescriptCodeLensProvider(),
        // makeCSharpCodeLensProvider(), makePythonCodeLensProvider().
        arguments: [codeConfig, templateConfigs],
    }

    return new vscode.CodeLens(range, command)
}

/**
 * Wraps the addSamDebugConfiguration logic in a picker that lets the user choose to create
 * a code-type debug config, template-type debug config, or an api-type debug config using a selected template
 * TODO: Dedupe? Call out dupes at the quick pick level?
 * @param codeConfig
 * @param templateConfigs
 */
export async function pickAddSamDebugConfiguration(
    codeConfig: AddSamDebugConfigurationInput,
    templateConfigs: AddSamDebugConfigurationInput[]
): Promise<void> {
    if (templateConfigs.length === 0) {
        await addSamDebugConfiguration(codeConfig, CODE_TARGET_TYPE)

        return
    }

    const templateItemsMap = new Map<string, AddSamDebugConfigurationInput>()
    const templateItems: vscode.QuickPickItem[] = []
    templateConfigs.forEach(templateConfig => {
        const label = `${getWorkspaceRelativePath(templateConfig.rootUri.fsPath) ?? templateConfig.rootUri.fsPath}:${
            templateConfig.resourceName
        }`

        if (templateConfig.apiEvent) {
            const apiLabel = `${label} (API Event: ${templateConfig.apiEvent.name})`
            const eventDetail = `${templateConfig.apiEvent.event.Properties?.Method?.toUpperCase()} ${
                templateConfig.apiEvent.event.Properties?.Path
            }`
            templateItems.push({ label: apiLabel, detail: eventDetail })
            templateItemsMap.set(apiLabel, templateConfig)
        } else {
            templateItems.push({ label: label })
            templateItemsMap.set(label, templateConfig)
        }
    })

    const noTemplate = localize('AWS.pickDebugConfig.noTemplate', 'No Template')
    const picker = createQuickPick<vscode.QuickPickItem>({
        options: {
            canPickMany: false,
            ignoreFocusOut: false,
            matchOnDetail: true,
            title: localize(
                'AWS.pickDebugConfig.prompt',
                'Create a Debug Configuration from a CloudFormation Template'
            ),
            step: 1,
            totalSteps: 1,
        },
        items: [
            ...templateItems,
            {
                label: noTemplate,
                detail: localize(
                    'AWS.pickDebugConfig.noTemplate.detail',
                    'Launch config will execute function in isolation, without referencing a CloudFormation template'
                ),
            },
        ],
    })

    const choices = await promptUser({ picker })
    const val = verifySinglePickerOutput(choices)

    if (!val) {
        return undefined
    }
    if (val.label === noTemplate) {
        await addSamDebugConfiguration(codeConfig, CODE_TARGET_TYPE, { step: 2, totalSteps: 2 })
    } else {
        const templateItem = templateItemsMap.get(val.label)
        if (!templateItem) {
            return undefined
        }
        if (templateItem.apiEvent) {
            await addSamDebugConfiguration(templateItem, API_TARGET_TYPE)
        } else {
            await addSamDebugConfiguration(templateItem, TEMPLATE_TARGET_TYPE)
        }
    }
}

export async function makePythonCodeLensProvider(): Promise<vscode.CodeLensProvider> {
    const logger = getLogger()

    return {
        // CodeLensProvider
        provideCodeLenses: async (
            document: vscode.TextDocument,
            token: vscode.CancellationToken
        ): Promise<vscode.CodeLens[]> => {
            // Try to activate the Python Extension before requesting symbols from a python file
            await pythonDebug.activatePythonExtensionIfInstalled()
            if (token.isCancellationRequested) {
                return []
            }

            const handlers: LambdaHandlerCandidate[] = await pythonCodelens.getLambdaHandlerCandidates(document.uri)
            logger.debug('pythonCodeLensProvider.makePythonCodeLensProvider handlers: %O', handlers)

            return makeCodeLenses({
                document,
                handlers,
                token,
                runtimeFamily: RuntimeFamily.Python,
            })
        },
    }
}

export async function makeCSharpCodeLensProvider(): Promise<vscode.CodeLensProvider> {
    const logger = getLogger()

    return {
        provideCodeLenses: async (
            document: vscode.TextDocument,
            token: vscode.CancellationToken
        ): Promise<vscode.CodeLens[]> => {
            const handlers: LambdaHandlerCandidate[] = await csharpCodelens.getLambdaHandlerCandidates(document)
            logger.debug('makeCSharpCodeLensProvider handlers: %O', handlers)

            return makeCodeLenses({
                document,
                handlers,
                token,
                runtimeFamily: RuntimeFamily.DotNetCore,
            })
        },
    }
}

export function makeTypescriptCodeLensProvider(): vscode.CodeLensProvider {
    const logger = getLogger()

    return {
        provideCodeLenses: async (
            document: vscode.TextDocument,
            token: vscode.CancellationToken
        ): Promise<vscode.CodeLens[]> => {
            const handlers = await tsCodelens.getLambdaHandlerCandidates(document)
            logger.debug('makeTypescriptCodeLensProvider handlers: %O', handlers)

            return makeCodeLenses({
                document,
                handlers,
                token,
                runtimeFamily: RuntimeFamily.NodeJS,
            })
        },
    }
}

export async function initializePythonCodelens(context: ExtContext): Promise<void> {
    context.extensionContext.subscriptions.push(
        vscode.commands.registerCommand(
            getInvokeCmdKey('python'),
            async (params: LambdaLocalInvokeParams): Promise<void> => {
                // TODO: restore or remove
            }
        )
    )
}

export async function initializeCsharpCodelens(context: ExtContext): Promise<void> {
    context.extensionContext.subscriptions.push(
        vscode.commands.registerCommand(
            getInvokeCmdKey(csharpCodelens.CSHARP_LANGUAGE),
            async (params: LambdaLocalInvokeParams) => {
                // await csharpDebug.invokeCsharpLambda({
                //     ctx: context,
                //     config: undefined,
                //     lambdaLocalInvokeParams: params,
                // })
            }
        )
    )
}

/**
 * LEGACY/DEPRECATED codelens-based debug entrypoint.
 */
export function initializeTypescriptCodelens(context: ExtContext): void {
    // const processInvoker = new DefaultValidatingSamCliProcessInvoker({}),
    // const localInvokeCommand = new DefaultSamLocalInvokeCommand(getChannelLogger(context.outputChannel), [
    //     WAIT_FOR_DEBUGGER_MESSAGES.NODEJS
    // ])
    const invokeLambda = async (params: LambdaLocalInvokeParams & { runtime: string }) => {
        // const samProjectCodeRoot = await getSamProjectDirPathForFile(params.uri.fsPath)
        // let debugPort: number | undefined
        // if (params.isDebug) {
        //     debugPort = await getStartPort()
        // }
        // const debugConfig: NodejsDebugConfiguration = {
        //     type: 'node',
        //     request: 'attach',
        //     name: 'SamLocalDebug',
        //     preLaunchTask: undefined,
        //     address: 'localhost',
        //     port: debugPort!,
        //     localRoot: samProjectCodeRoot,
        //     remoteRoot: '/var/task',
        //     protocol: 'inspector',
        //     skipFiles: ['/var/runtime/node_modules/**/*.js', '<node_internals>/**/*.js']
        // }
        // const localLambdaRunner: LocalLambdaRunner = new LocalLambdaRunner(
        //     configuration,
        //     params,
        //     debugPort,
        //     params.runtime,
        //     toolkitOutputChannel,
        //     processInvoker,
        //     localInvokeCommand,
        //     debugConfig,
        //     samProjectCodeRoot,
        //     telemetryService
        // )
        // await localLambdaRunner.run()
    }

    const command = getInvokeCmdKey('javascript')
    context.extensionContext.subscriptions.push(
        vscode.commands.registerCommand(command, async (params: LambdaLocalInvokeParams) => {
            const logger = getLogger()

            const resource = await CloudFormation.getResourceFromTemplate({
                handlerName: params.handlerName,
                templatePath: params.samTemplate.fsPath,
            })
            const template = await CloudFormation.load(params.samTemplate.fsPath)
            const lambdaRuntime = CloudFormation.getRuntime(resource, template)
            let invokeResult: Result = 'Succeeded'
            try {
                if (!nodeJsRuntimes.has(lambdaRuntime)) {
                    invokeResult = 'Failed'
                    logger.error(
                        `Javascript local invoke on ${params.uri.fsPath} encountered` +
                            ` unsupported runtime ${lambdaRuntime}`
                    )

                    vscode.window.showErrorMessage(
                        localize(
                            'AWS.samcli.local.invoke.runtime.unsupported',
                            'Unsupported {0} runtime: {1}',
                            'javascript',
                            lambdaRuntime
                        )
                    )
                } else {
                    await invokeLambda({
                        runtime: lambdaRuntime,
                        ...params,
                    })
                }
            } catch (err) {
                invokeResult = 'Failed'
                throw err
            } finally {
                recordLambdaInvokeLocal({
                    // this is the legacy path; only supports ZIPs
                    lambdaPackageType: 'Zip',
                    result: invokeResult,
                    runtime: lambdaRuntime as Runtime,
                    debug: params.isDebug,
                })
            }
        })
    )
}
