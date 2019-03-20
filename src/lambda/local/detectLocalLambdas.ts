/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as vscode from 'vscode'
import { CloudFormation } from '../../shared/cloudformation/cloudformation'
import { fileExists } from '../../shared/filesystemUtilities'
import { detectLocalTemplates } from './detectLocalTemplates'

export interface LocalLambda {
    lambda: string
    protocol: 'inspector' | 'legacy'
    workspaceFolder: vscode.WorkspaceFolder
    resource: CloudFormation.Resource
    templatePath: string
    handler?: string
}

export async function detectLocalLambdas(
    workspaceFolders: vscode.WorkspaceFolder[] | undefined = vscode.workspace.workspaceFolders
): Promise<LocalLambda[]> {
    if (!workspaceFolders) {
        return []
    }

    return (await Promise.all(workspaceFolders.map(detectLambdasFromWorkspaceFolder))).reduce(
        (accumulator: LocalLambda[], current: LocalLambda[]) => {
            accumulator.push(...current)

            return accumulator
        },
        []
    )
}

async function detectLambdasFromWorkspaceFolder(
    workspaceFolder: vscode.WorkspaceFolder
): Promise<LocalLambda[]> {
    const result = []

    for await (const templateUri of detectLocalTemplates({ workspaceUris: [workspaceFolder.uri] })) {
        result.push(...await detectLambdasFromTemplate(workspaceFolder, templateUri.fsPath))
    }

    return result
}

async function detectLambdasFromTemplate(
    workspaceFolder: vscode.WorkspaceFolder,
    templatePath: string
): Promise<LocalLambda[]> {
    if (!await fileExists(templatePath)) {
        return []
    }

    const template: CloudFormation.Template = await CloudFormation.load(templatePath)

    const resources = template.Resources
    if (!resources) {
        return []
    }

    return Object.getOwnPropertyNames(resources)
        .filter(key => resources[key]!.Type === 'AWS::Serverless::Function')
        .map(key => ({
            lambda: key,
            workspaceFolder,
            templatePath,
            protocol: getDebugProtocol(resources[key]!),
            handler: getHandler(resources[key]!),
            resource: resources[key]!
        }))
}

function getDebugProtocol(resource: CloudFormation.Resource): 'inspector' | 'legacy' {
    if (!resource.Properties || !resource.Properties.Runtime) {
        return 'inspector'
    }

    const matches = resource.Properties.Runtime.match(/^nodejs(\d+)/)
    if (!matches || matches.length !== 2) {
        return 'inspector'
    }

    const majorVersion: number = parseInt(matches[1], 10)

    // Officially, both 'inspector' and 'legacy' are supported on [6.3, 7) (*nix) and [6.9, 7) (windows)
    // But in practice, 'inspector' seems to be unstable and cause connection timeouts for 6.*. So we
    // use 'legacy' when both protocols are available.
    return isNaN(majorVersion) || majorVersion > 6 ? 'inspector' : 'legacy'
}

function getHandler(resource: CloudFormation.Resource): string | undefined {
    if (resource.Properties && resource.Properties.Handler) {
        return resource.Properties.Handler
    }

    return undefined
}
