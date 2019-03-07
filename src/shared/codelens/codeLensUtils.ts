/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as vscode from 'vscode'

import { LambdaHandlerCandidate } from '../lambdaHandlerSearch'
import {
    SamCliProcessInvoker,
    SamCliTaskInvoker
} from '../sam/cli/samCliInvoker'
import { SettingsConfiguration } from '../settingsConfiguration'

import { getLogger } from '../logger'
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
    language: Language
}

export async function makeCodeLenses({ document, token, handlers, language }: {
    document: vscode.TextDocument,
    token: vscode.CancellationToken,
    handlers: LambdaHandlerCandidate[],
    language: Language
}): Promise<vscode.CodeLens[]> {

    const lenses: vscode.CodeLens[] = []

    handlers.forEach(handler => {
        // handler.range is a RangeOrCharOffset union type. Extract vscode.Range.
        const range = new vscode.Range(
            document.positionAt(handler.positionStart),
            document.positionAt(handler.positionEnd),
        )
        const workspaceFolder:
            vscode.WorkspaceFolder | undefined = vscode.workspace.getWorkspaceFolder(document.uri)

        if (!workspaceFolder) {
            throw new Error(`Source file ${document.uri} is external to the current workspace.`)
        }
        const baseParams: MakeConfigureCodeLensParams = {
            document,
            handlerName: handler.handlerName,
            range,
            workspaceFolder,
            language
        }
        lenses.push(makeLocalInvokeCodeLens({ ...baseParams, debug: false }))
        lenses.push(makeLocalInvokeCodeLens({ ...baseParams, debug: true }))

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

export function getInvokeCmdKey(lang: Language) {
    return `aws.lambda.local.invoke.${lang}`
}

function makeLocalInvokeCodeLens(
    params: MakeConfigureCodeLensParams & { debug: boolean, language: Language }
): vscode.CodeLens {
    const title: string = params.debug ?
        localize('AWS.codelens.lambda.invoke.debug', 'Debug Locally') :
        localize('AWS.codelens.lambda.invoke', 'Run Locally')

    const command: vscode.Command = {
        arguments: [params],
        command: getInvokeCmdKey(params.language),
        title
    }

    return new vscode.CodeLens(params.range, command)
}

function makeConfigureCodeLens(
    { document, handlerName, range, workspaceFolder }: MakeConfigureCodeLensParams
): vscode.CodeLens {
    // Handler will be the fully-qualified name, so we also allow '.' despite it being forbidden in handler names.
    if (/[^\w\-\.]/.test(handlerName)) {
        throw new Error(
            `Invalid handler name: '${handlerName}'. ` +
            'Handler names can contain only letters, numbers, hyphens, and underscores.'
        )
    }
    const command = {
        arguments: [workspaceFolder, handlerName],
        command: 'aws.configureLambda',
        title: localize('AWS.command.configureLambda', 'Configure')
    }

    return new vscode.CodeLens(range, command)
}
