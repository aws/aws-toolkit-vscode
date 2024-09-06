/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

//
// TODO: DEPRECATED. Remove this after removing support for the legacy
// "templates.json" support.
//
import * as vscode from 'vscode'
import * as CloudFormation from '../../shared/cloudformation/cloudformation'
import { getNormalizedRelativePath } from '../../shared/utilities/pathUtils'
import { load as loadTemplatesConfig } from '../config/templates'

export interface GetParametersContext {
    loadTemplate: typeof CloudFormation.load
}

export async function getParameters(
    templateUri: vscode.Uri,
    context: GetParametersContext = { loadTemplate: CloudFormation.load }
): Promise<Map<string, { required: boolean }>> {
    const template = await context.loadTemplate(templateUri.fsPath)
    if (!template.Parameters) {
        return new Map()
    }

    const result = new Map<string, { required: boolean }>()

    for (const name of Object.getOwnPropertyNames(template.Parameters)) {
        const parameter = template.Parameters[name]!

        result.set(name, {
            // Explicitly compare with undefined, as a valid default value may be falsy.
            required: parameter.Default === undefined,
        })
    }

    return result
}

export async function getParameterNames(
    templateUri: vscode.Uri,
    context: GetParametersContext = { loadTemplate: CloudFormation.load }
): Promise<string[]> {
    return [...(await getParameters(templateUri, context)).keys()]
}

export interface GetOverriddenParametersContext {
    readonly loadTemplatesConfig: typeof loadTemplatesConfig
    getWorkspaceFolder(uri: vscode.Uri): Pick<vscode.WorkspaceFolder, 'uri'> | undefined
}

export class DefaultGetOverriddenParametersContext implements GetOverriddenParametersContext {
    public readonly getWorkspaceFolder = vscode.workspace.getWorkspaceFolder
    public readonly loadTemplatesConfig = loadTemplatesConfig
}

export async function getOverriddenParameters(
    templateUri: vscode.Uri,
    context: GetOverriddenParametersContext = new DefaultGetOverriddenParametersContext()
): Promise<Map<string, string> | undefined> {
    const workspaceFolder = context.getWorkspaceFolder(templateUri)
    if (!workspaceFolder) {
        // This should never happen.
        throw new Error(`The template ${templateUri.fsPath} is not in the workspace`)
    }

    const relativeTemplatePath = getNormalizedRelativePath(workspaceFolder.uri.fsPath, templateUri.fsPath)
    const templatesConfig = await context.loadTemplatesConfig(workspaceFolder.uri.fsPath)
    const templateConfig = templatesConfig.templates[relativeTemplatePath]
    if (!templateConfig || !templateConfig.parameterOverrides) {
        return undefined
    }

    const result = new Map<string, string>()

    for (const name of Object.getOwnPropertyNames(templateConfig.parameterOverrides)) {
        result.set(name, templateConfig.parameterOverrides[name]!)
    }

    return result
}
