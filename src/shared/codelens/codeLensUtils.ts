/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

import { detectLocalTemplates } from '../../lambda/local/detectLocalTemplates'
import { CloudFormation } from '../cloudformation/cloudformation'
import { LambdaHandlerCandidate } from '../lambdaHandlerSearch'
import { getLogger } from '../logger'
import { SamCliProcessInvoker } from '../sam/cli/samCliInvokerUtils'
import { SamLocalInvokeCommand } from '../sam/cli/samCliLocalInvoke'
import { SettingsConfiguration } from '../settingsConfiguration'
import { MetricDatum } from '../telemetry/clienttelemetry'
import { TelemetryService } from '../telemetry/telemetryService'
import { defaultMetricDatum } from '../telemetry/telemetryUtils'
import { localize } from '../utilities/vsCodeUtils'

export type Language = 'python' | 'javascript' | 'csharp'

export interface CodeLensProviderParams {
    configuration: SettingsConfiguration
    outputChannel: vscode.OutputChannel
    processInvoker?: SamCliProcessInvoker
    localInvokeCommand?: SamLocalInvokeCommand
    telemetryService: TelemetryService
}

interface MakeConfigureCodeLensParams {
    document: vscode.TextDocument
    handlerName: string
    range: vscode.Range
    workspaceFolder: vscode.WorkspaceFolder
    samTemplate: vscode.Uri
    language: Language
}

export const DRIVE_LETTER_REGEX = /^\w\:/

export async function makeCodeLenses({
    document,
    token,
    handlers,
    language
}: {
    document: vscode.TextDocument
    token: vscode.CancellationToken
    handlers: LambdaHandlerCandidate[]
    language: Language
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
            const associatedTemplate = await getAssociatedSamTemplate(
                document.uri,
                workspaceFolder.uri,
                handler.handlerName
            )
            const baseParams: MakeConfigureCodeLensParams = {
                document,
                handlerName: handler.handlerName,
                range,
                workspaceFolder,
                samTemplate: associatedTemplate,
                language
            }
            lenses.push(makeLocalInvokeCodeLens({ ...baseParams, isDebug: false }))
            lenses.push(makeLocalInvokeCodeLens({ ...baseParams, isDebug: true }))

            lenses.push(makeConfigureCodeLens(baseParams))
        } catch (err) {
            getLogger().error(
                `Could not generate 'configure' code lens for handler '${handler.handlerName}'`,
                err as Error
            )
        }
    }

    return lenses
}

export function getInvokeCmdKey(language: Language) {
    return `aws.lambda.local.invoke.${language}`
}

function makeLocalInvokeCodeLens(
    params: MakeConfigureCodeLensParams & { isDebug: boolean; language: Language }
): vscode.CodeLens {
    const title: string = params.isDebug
        ? localize('AWS.codelens.lambda.invoke.debug', 'Debug Locally')
        : localize('AWS.codelens.lambda.invoke', 'Run Locally')

    const command: vscode.Command = {
        arguments: [params],
        command: getInvokeCmdKey(params.language),
        title
    }

    return new vscode.CodeLens(params.range, command)
}

function makeConfigureCodeLens({
    document,
    handlerName,
    range,
    workspaceFolder,
    samTemplate
}: MakeConfigureCodeLensParams): vscode.CodeLens {
    // Handler will be the fully-qualified name, so we also allow '.' & ':' & '/' despite it being forbidden in handler names.
    if (/[^\w\-\.\:\/]/.test(handlerName)) {
        throw new Error(`Invalid handler name: '${handlerName}'`)
    }
    const command = {
        arguments: [workspaceFolder, handlerName, samTemplate],
        command: 'aws.configureLambda',
        title: localize('AWS.command.configureLambda', 'Configure')
    }

    return new vscode.CodeLens(range, command)
}

export function getMetricDatum({ isDebug, runtime }: { isDebug: boolean; runtime: string }): { datum: MetricDatum } {
    return {
        datum: {
            ...defaultMetricDatum('lambda_invokelocal'),
            Metadata: [
                { Key: 'runtime', Value: `${runtime}` },
                { Key: 'debug', Value: `${isDebug}` }
            ]
        }
    }
}

async function getAssociatedSamTemplate(
    documentUri: vscode.Uri,
    workspaceFolderUri: vscode.Uri,
    handlerName: string
): Promise<vscode.Uri> {
    const templates = detectLocalTemplates({
        workspaceUris: [workspaceFolderUri]
    })

    for await (const template of templates) {
        try {
            // Throws if template does not contain a resource for this handler.
            await CloudFormation.getResourceFromTemplate({
                templatePath: template.fsPath,
                handlerName
            })
        } catch {
            continue
        }

        // If there are multiple matching templates, use the first one.
        return template
    }

    throw new Error(`Unable to find a sam template associated with handler '${handlerName}' in ${documentUri.fsPath}.`)
}
