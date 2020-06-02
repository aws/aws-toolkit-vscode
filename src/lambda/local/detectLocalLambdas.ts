/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { CloudFormation } from '../../shared/cloudformation/cloudformation'
import { fileExists } from '../../shared/filesystemUtilities'
import { detectLocalTemplates } from './detectLocalTemplates'

export interface LocalLambda {
    lambda: string
    workspaceFolder: vscode.WorkspaceFolder
    resource: CloudFormation.Resource
    templateGlobals: CloudFormation.TemplateGlobals
    templatePath: string
    handler?: string
}

// TODO: remove?
// Key difference: `detectLocalTemplates()` crawls workspace for template files...
export async function detectLocalLambdas(workspaceFolders: vscode.WorkspaceFolder[]): Promise<LocalLambda[]> {
    return (await Promise.all(workspaceFolders.map(detectLambdasFromWorkspaceFolder))).reduce(
        (accumulator: LocalLambda[], current: LocalLambda[]) => {
            accumulator.push(...current)

            return accumulator
        },
        []
    )
}

async function detectLambdasFromWorkspaceFolder(workspaceFolder: vscode.WorkspaceFolder): Promise<LocalLambda[]> {
    const result = []

    for await (const templateUri of detectLocalTemplates({ workspaceUris: [workspaceFolder.uri] })) {
        result.push(...(await detectLambdasFromTemplate(workspaceFolder, templateUri.fsPath)))
    }

    return result
}

async function detectLambdasFromTemplate(
    workspaceFolder: vscode.WorkspaceFolder,
    templatePath: string
): Promise<LocalLambda[]> {
    if (!(await fileExists(templatePath))) {
        return []
    }

    const template: CloudFormation.Template = await CloudFormation.load(templatePath)

    const resources = template.Resources
    if (!resources) {
        return []
    }

    return Object.getOwnPropertyNames(resources)
        .filter(key => resources[key]!.Type === CloudFormation.SERVERLESS_FUNCTION_TYPE)
        .map(key => ({
            lambda: key,
            workspaceFolder,
            templatePath,
            templateGlobals: template.Globals,
            handler: getHandler(resources[key]!),
            resource: resources[key]!,
        }))
}

function getHandler(resource: CloudFormation.Resource): string | undefined {
    if (resource.Properties && resource.Properties.Handler) {
        return resource.Properties.Handler
    }

    return undefined
}
