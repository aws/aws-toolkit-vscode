/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as vscode from 'vscode'

import { dirname } from 'path'
import { detectLocalTemplates } from '../../lambda/local/detectLocalTemplates'
import { LambdaHandlerCandidate } from '../lambdaHandlerSearch'
import { getLogger } from '../logger'
import { SamCliProcessInvoker, SamCliTaskInvoker } from '../sam/cli/samCliInvokerUtils'
import { SettingsConfiguration } from '../settingsConfiguration'
import { Datum } from '../telemetry/telemetryEvent'
import { defaultMetricDatum } from '../telemetry/telemetryUtils'
import { toArrayAsync } from '../utilities/collectionUtils'
import { localize } from '../utilities/vsCodeUtils'

export type Language = 'python' | 'javascript'

export interface CodeLensProviderParams {
    configuration: SettingsConfiguration,
    toolkitOutputChannel: vscode.OutputChannel, // TODO: Rename this lambdaOuputChannel? ouputChannel? Provide both?
    processInvoker?: SamCliProcessInvoker,
    taskInvoker?: SamCliTaskInvoker
}

interface MakeConfigureCodeLensParams {
    document: vscode.TextDocument,
    handlerName: string,
    range: vscode.Range,
    workspaceFolder: vscode.WorkspaceFolder,
    samTemplate: vscode.Uri,
    language: Language
}

export async function makeCodeLenses({ document, token, handlers, language }: {
    document: vscode.TextDocument,
    token: vscode.CancellationToken,
    handlers: LambdaHandlerCandidate[],
    language: Language
}): Promise<vscode.CodeLens[]> {
    const workspaceFolder:
        vscode.WorkspaceFolder | undefined = vscode.workspace.getWorkspaceFolder(document.uri)

    if (!workspaceFolder) {
        throw new Error(`Source file ${document.uri} is external to the current workspace.`)
    }

    const associatedTemplate: vscode.Uri = await getAssociatedSamTemplate(document.uri, workspaceFolder.uri)
    const lenses: vscode.CodeLens[] = []

    handlers.forEach(handler => {
        // handler.range is a RangeOrCharOffset union type. Extract vscode.Range.
        const range = (handler.range instanceof vscode.Range) ? handler.range : new vscode.Range(
            document.positionAt(handler.range.positionStart),
            document.positionAt(handler.range.positionEnd),
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
        if (language !== 'python') {
            // TODO: Add debugging support for Python and make this run unconditionally
            lenses.push(makeLocalInvokeCodeLens({ ...baseParams, isDebug: true }))
        }

        try {
            lenses.push(makeConfigureCodeLens(baseParams))
        } catch (err) {
            getLogger().error(
                `Could not generate 'configure' code lens for handler '${handler.handlerName}'`,
                err as Error
            )
        }
    })

    return lenses
}

export function getInvokeCmdKey(language: Language) {
    return `aws.lambda.local.invoke.${language}`
}

function makeLocalInvokeCodeLens(
    params: MakeConfigureCodeLensParams & { isDebug: boolean, language: Language }
): vscode.CodeLens {
    const title: string = params.isDebug ?
        localize('AWS.codelens.lambda.invoke.debug', 'Debug Locally') :
        localize('AWS.codelens.lambda.invoke', 'Run Locally')

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
    // Handler will be the fully-qualified name, so we also allow '.' despite it being forbidden in handler names.
    if (/[^\w\-\.]/.test(handlerName)) {
        throw new Error(
            `Invalid handler name: '${handlerName}'. ` +
            'Handler names can contain only letters, numbers, hyphens, and underscores.'
        )
    }
    const command = {
        arguments: [workspaceFolder, handlerName, samTemplate],
        command: 'aws.configureLambda',
        title: localize('AWS.command.configureLambda', 'Configure')
    }

    return new vscode.CodeLens(range, command)
}

export function getMetricDatum({ command, isDebug, runtime }: {
    command: string,
    isDebug: boolean,
    runtime: string,
}): { datum: Datum } {
    return {
        datum: {
            ...defaultMetricDatum(command),
            metadata: new Map([
                ['runtime', runtime],
                ['debug', `${isDebug}`]
            ])
        }
    }
}

async function getAssociatedSamTemplate(
    documentUri: vscode.Uri,
    workspaceFolderUri: vscode.Uri
): Promise<vscode.Uri> {

    // Get Template files in Workspace
    const templatesAsync: AsyncIterableIterator<vscode.Uri> = detectLocalTemplates({
        workspaceUris: [workspaceFolderUri]
    })

    // See which templates (if any) are in a folder, or parent folder, of the document of interest
    const templates = await toArrayAsync(templatesAsync)
    const candidateTemplates = templates
        .filter(template => {
            const folder = dirname(template.fsPath)

            return documentUri.fsPath.indexOf(folder) === 0
        })

    if (candidateTemplates.length === 0) {
        throw new Error(
            `Unable to find a sam template associated with ${documentUri.fsPath}. Skipping CodeLens generation.`
        )
    } else if (candidateTemplates.length > 1) {
        throw new Error(
            `More than one sam template associated with ${documentUri.fsPath}. Skipping CodeLens generation.`
            + ` Templates detected: ${candidateTemplates.map(t => t.fsPath).join(', ')}`
        )
    }

    return candidateTemplates[0]
}
