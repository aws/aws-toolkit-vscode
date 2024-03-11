/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { RuntimeFamily } from '../../lambda/models/samLambdaRuntime'
import * as CloudFormation from '../cloudformation/cloudformation'
import { getResourcesForHandler } from '../fs/templateRegistry'
import { LambdaHandlerCandidate } from '../lambdaHandlerSearch'
import { getLogger } from '../logger'
import { API_TARGET_TYPE, CODE_TARGET_TYPE, TEMPLATE_TARGET_TYPE } from '../sam/debugger/awsSamDebugConfiguration'
import {
    addSamDebugConfiguration,
    AddSamDebugConfigurationInput,
} from '../sam/debugger/commands/addSamDebugConfiguration'
import { createQuickPick, promptUser, verifySinglePickerOutput } from '../ui/picker'
import { activateExtension, localize } from '../utilities/vsCodeUtils'
import { getWorkspaceRelativePath } from '../utilities/workspaceUtils'
import * as csharpCodelens from './csharpCodeLensProvider'
import * as javaCodelens from './javaCodeLensProvider'
import * as pythonCodelens from './pythonCodeLensProvider'
import * as tsCodelens from './typescriptCodeLensProvider'
import * as goCodelens from './goCodeLensProvider'
import { VSCODE_EXTENSION_ID } from '../extensions'
import { getIdeProperties } from '../extensionUtilities'
import { SamCliSettings } from '../sam/cli/samCliSettings'
import globals from '../extensionGlobals'

export type Language = 'python' | 'javascript' | 'csharp' | 'go' | 'java' | 'typescript'

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
        getLogger().error(`makeCodeLenses: source file is external to workspace: ${document.uri}`)

        return []
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
            const registry = await globals.templateRegistry
            const associatedResources = getResourcesForHandler(handler.filename, handler.handlerName, registry.items)
            const templateConfigs: AddSamDebugConfigurationInput[] = []

            if (associatedResources.length > 0) {
                for (const resource of associatedResources) {
                    const isImage = CloudFormation.isImageLambdaResource(resource.resourceData.Properties)
                    templateConfigs.push({
                        resourceName: resource.name,
                        rootUri: vscode.Uri.file(resource.templateDatum.path),
                        runtimeFamily: isImage ? runtimeFamily : undefined,
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
                                    runtimeFamily: isImage ? runtimeFamily : undefined,
                                })
                            }
                        }
                    }
                }
            }
            const codeConfig: AddSamDebugConfigurationInput = {
                resourceName: handler.handlerName,
                rootUri: handler.rootUri,
                runtimeFamily,
            }
            lenses.push(
                makeAddCodeSamDebugCodeLens(range, codeConfig, templateConfigs, false),
                makeAddCodeSamDebugCodeLens(range, codeConfig, templateConfigs, true)
            )
        } catch (err) {
            getLogger().error(
                `Could not generate 'configure' code lens for handler '${handler.handlerName}': %O`,
                err as Error
            )
        }
    }

    return lenses
}

function makeAddCodeSamDebugCodeLens(
    range: vscode.Range,
    codeConfig: AddSamDebugConfigurationInput,
    templateConfigs: AddSamDebugConfigurationInput[],
    openWebview: boolean
): vscode.CodeLens {
    const title = openWebview
        ? `${getIdeProperties().company}: ${localize('AWS.codelens.lambda.configEditor', 'Edit Debug Configuration')}`
        : `${getIdeProperties().company}: ${localize(
              'AWS.command.addSamDebugConfiguration',
              'Add Debug Configuration'
          )}`
    const command: vscode.Command = {
        title,
        command: 'aws.pickAddSamDebugConfiguration',
        // Values provided by makeTypescriptCodeLensProvider(),
        // makeCSharpCodeLensProvider(), makePythonCodeLensProvider().
        arguments: [codeConfig, templateConfigs, openWebview],
    }

    return new vscode.CodeLens(range, command)
}

/**
 * Tied to the AWS.addSamDebugConfig command: lets a user create a config tied to a handler via command instead of codelens
 * Renders a quick pick using the first 200 characters of the first line of the function declaration + function line number
 * @param document Curr document
 * @param lenses Codelenses returned via CodeLensProvider, which we extract the information from
 */
export async function invokeCodeLensCommandPalette(
    document: Pick<vscode.TextDocument, 'getText'>,
    lenses: vscode.CodeLens[],
    nextStep: (
        codeConfig: AddSamDebugConfigurationInput,
        templateConfigs: AddSamDebugConfigurationInput[],
        openWebview: boolean,
        continuationStep?: boolean
    ) => Promise<void> = pickAddSamDebugConfiguration
): Promise<void> {
    const labelRenderRange = 200
    const handlers: (vscode.QuickPickItem & { lens?: vscode.CodeLens })[] = lenses
        .filter(lens => {
            // remove codelenses that go to the invoker UI
            // maybe move this into the workflow at some point (drop down to one)
            return (
                lens &&
                lens.command &&
                lens.command.arguments &&
                lens.command.arguments.length === 3 &&
                lens.command.arguments![2] !== true
            )
        })
        .map(lens => {
            return {
                // lens is currently pulling the entire function, not just the declaration
                label: document.getText(
                    new vscode.Range(
                        lens.range.start,
                        new vscode.Position(lens.range.start.line, lens.range.start.character + labelRenderRange)
                    )
                ),
                detail: localize(
                    'AWS.pickDebugHandler.range',
                    'Function on line {0}',
                    (lens.range.start.line + 1).toString()
                ),
                lens,
            }
        })
    if (handlers.length === 0) {
        handlers.push({
            label: localize('AWS.pickDebugHandler.noItems', 'No handlers found in current file'),
            detail: localize('AWS.pickDebugHandler.noItems.detail', 'Ensure your language extension is working'),
            description: localize('AWS.picker.dynamic.noItemsFound.detail', 'Click here to go back'),
        })
    }

    const picker = createQuickPick<vscode.QuickPickItem & { lens?: vscode.CodeLens }>({
        options: {
            canPickMany: false,
            ignoreFocusOut: false,
            matchOnDetail: true,
            title: localize('AWS.pickDebugHandler.prompt', 'Create a Debug Configuration from a valid handler'),
            step: 1,
            totalSteps: 2,
        },
        items: handlers,
    })

    const choices = await promptUser({ picker })
    const val = verifySinglePickerOutput(choices)

    if (!val || !val.lens || !val.lens.command) {
        return undefined
    }

    // note: val.lens.command.arguments[2] should always be false (aka no invoke UI) based on the filter statement
    await nextStep(val.lens.command.arguments![0], val.lens.command.arguments![1], val.lens.command.arguments![2], true)
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
    templateConfigs: AddSamDebugConfigurationInput[],
    openWebview: boolean,
    continuationStep?: boolean
): Promise<void> {
    if (templateConfigs.length === 0) {
        await addSamDebugConfiguration(codeConfig, CODE_TARGET_TYPE, openWebview)

        return
    }

    const templateItemsMap = new Map<string, AddSamDebugConfigurationInput>()
    const templateItems: vscode.QuickPickItem[] = []
    templateConfigs.forEach(templateConfig => {
        const label = `${
            getWorkspaceRelativePath(templateConfig.rootUri.fsPath)?.relativePath ?? templateConfig.rootUri.fsPath
        }:${templateConfig.resourceName}`

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
            step: continuationStep ? 2 : 1,
            totalSteps: continuationStep ? 2 : 1,
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
        await addSamDebugConfiguration(codeConfig, CODE_TARGET_TYPE, openWebview, {
            step: continuationStep ? 3 : 2,
            totalSteps: continuationStep ? 3 : 2,
        })
    } else {
        const templateItem = templateItemsMap.get(val.label)
        if (!templateItem) {
            return undefined
        }
        if (templateItem.apiEvent) {
            await addSamDebugConfiguration(templateItem, API_TARGET_TYPE, openWebview)
        } else {
            await addSamDebugConfiguration(templateItem, TEMPLATE_TARGET_TYPE, openWebview)
        }
    }
}

export interface OverridableCodeLensProvider extends vscode.CodeLensProvider {
    provideCodeLenses: (
        document: vscode.TextDocument,
        token: vscode.CancellationToken,
        forceProvide?: boolean
    ) => Promise<vscode.CodeLens[]>
}

export async function makePythonCodeLensProvider(configuration: SamCliSettings): Promise<OverridableCodeLensProvider> {
    return {
        // CodeLensProvider
        provideCodeLenses: async (
            document: vscode.TextDocument,
            token: vscode.CancellationToken,
            forceProvide?: boolean
        ): Promise<vscode.CodeLens[]> => {
            if (!forceProvide && !configuration.get('enableCodeLenses', false)) {
                return []
            }
            // Try to activate the Python Extension before requesting symbols from a python file
            await activateExtension(VSCODE_EXTENSION_ID.python)
            if (token.isCancellationRequested) {
                return []
            }

            const handlers: LambdaHandlerCandidate[] = await pythonCodelens.getLambdaHandlerCandidates(document.uri)
            return makeCodeLenses({
                document,
                handlers,
                token,
                runtimeFamily: RuntimeFamily.Python,
            })
        },
    }
}

export async function makeCSharpCodeLensProvider(configuration: SamCliSettings): Promise<OverridableCodeLensProvider> {
    return {
        provideCodeLenses: async (
            document: vscode.TextDocument,
            token: vscode.CancellationToken,
            forceProvide?: boolean
        ): Promise<vscode.CodeLens[]> => {
            if (!forceProvide && !configuration.get('enableCodeLenses', false)) {
                return []
            }
            const handlers: LambdaHandlerCandidate[] = await csharpCodelens.getLambdaHandlerCandidates(document)
            return makeCodeLenses({
                document,
                handlers,
                token,
                runtimeFamily: RuntimeFamily.DotNet,
            })
        },
    }
}

export function makeTypescriptCodeLensProvider(configuration: SamCliSettings): OverridableCodeLensProvider {
    return {
        provideCodeLenses: async (
            document: vscode.TextDocument,
            token: vscode.CancellationToken,
            forceProvide?: boolean
        ): Promise<vscode.CodeLens[]> => {
            if (!forceProvide && !configuration.get('enableCodeLenses', false)) {
                return []
            }
            const handlers = await tsCodelens.getLambdaHandlerCandidates(document)
            return makeCodeLenses({
                document,
                handlers,
                token,
                runtimeFamily: RuntimeFamily.NodeJS,
            })
        },
    }
}

export async function makeGoCodeLensProvider(configuration: SamCliSettings): Promise<OverridableCodeLensProvider> {
    return {
        provideCodeLenses: async (
            document: vscode.TextDocument,
            token: vscode.CancellationToken,
            forceProvide?: boolean
        ): Promise<vscode.CodeLens[]> => {
            if (!forceProvide && !configuration.get('enableCodeLenses', false)) {
                return []
            }
            const handlers = await goCodelens.getLambdaHandlerCandidates(document)
            return makeCodeLenses({
                document,
                handlers,
                token,
                runtimeFamily: RuntimeFamily.Go,
            })
        },
    }
}

export async function makeJavaCodeLensProvider(configuration: SamCliSettings): Promise<OverridableCodeLensProvider> {
    return {
        provideCodeLenses: async (
            document: vscode.TextDocument,
            token: vscode.CancellationToken,
            forceProvide?: boolean
        ): Promise<vscode.CodeLens[]> => {
            if (!forceProvide && !configuration.get('enableCodeLenses', false)) {
                return []
            }
            // Try to activate the Java Extension before requesting symbols from a java file
            await activateExtension(VSCODE_EXTENSION_ID.java)
            if (token.isCancellationRequested) {
                return []
            }

            const handlers: LambdaHandlerCandidate[] = await javaCodelens.getLambdaHandlerCandidates(document)
            return makeCodeLenses({
                document,
                handlers,
                token,
                runtimeFamily: RuntimeFamily.Java,
            })
        },
    }
}
