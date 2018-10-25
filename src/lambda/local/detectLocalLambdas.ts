/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as schema from 'cloudformation-schema-js-yaml'
import * as yaml from 'js-yaml'
import * as path from 'path'
import * as vscode from 'vscode'
import { fileExists, readFileAsString } from '../../shared/filesystemUtilities'

export interface LocalLambda {
    lambda: string
    workspaceFolder: vscode.WorkspaceFolder
    templatePath?: string
}

interface CloudFormationTemplate {
    Resources?: {
        [ key: string ]: {
            Type: string
        }
    }
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
    return [
        ...await detectLambdasFromTemplate(workspaceFolder, path.join(workspaceFolder.uri.fsPath, 'template.yml')),
        ...await detectLambdasFromTemplate(workspaceFolder, path.join(workspaceFolder.uri.fsPath, 'template.yaml'))
    ]
}

async function detectLambdasFromTemplate(
    workspaceFolder: vscode.WorkspaceFolder,
    templatePath: string
): Promise<LocalLambda[]> {
    if (!await fileExists(templatePath)) {
        return []
    }

    const templateContent = await readFileAsString(templatePath)
    const template = yaml.safeLoad(templateContent, {
        filename: templatePath,
        schema
    }) as CloudFormationTemplate

    const resources = template.Resources
    if (!resources) {
        return []
    }

    return Object.keys(resources)
        .filter(key => resources[key].Type === 'AWS::Serverless::Function')
        .map(key => ({
            lambda: key,
            workspaceFolder,
            templatePath
        }))
}
