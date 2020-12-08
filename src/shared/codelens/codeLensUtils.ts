/*!
 * Copyright 2018-2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { RuntimeFamily } from '../../lambda/models/samLambdaRuntime'
import { getResourcesForHandler } from '../cloudformation/templateRegistry'
import { LambdaHandlerCandidate } from '../lambdaHandlerSearch'
import { getLogger } from '../logger'
import { API_TARGET_TYPE, CODE_TARGET_TYPE, TEMPLATE_TARGET_TYPE } from '../sam/debugger/awsSamDebugConfiguration'
import {
    addSamDebugConfiguration,
    AddSamDebugConfigurationInput,
} from '../sam/debugger/commands/addSamDebugConfiguration'
import * as pythonDebug from '../sam/debugger/pythonSamDebug'
import { createQuickPick, promptUser, verifySinglePickerOutput } from '../ui/picker'
import { localize } from '../utilities/vsCodeUtils'
import { getWorkspaceRelativePath } from '../utilities/workspaceUtils'
import * as csharpCodelens from './csharpCodeLensProvider'
import * as pythonCodelens from './pythonCodeLensProvider'
import * as tsCodelens from './typescriptCodeLensProvider'

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
    return {
        provideCodeLenses: async (
            document: vscode.TextDocument,
            token: vscode.CancellationToken
        ): Promise<vscode.CodeLens[]> => {
            const handlers: LambdaHandlerCandidate[] = await csharpCodelens.getLambdaHandlerCandidates(document)
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
    return {
        provideCodeLenses: async (
            document: vscode.TextDocument,
            token: vscode.CancellationToken
        ): Promise<vscode.CodeLens[]> => {
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
