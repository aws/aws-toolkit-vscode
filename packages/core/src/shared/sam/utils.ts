/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ToolkitError } from '../errors'
import path from 'path'
import { AWSTreeNodeBase } from '../treeview/nodes/awsTreeNodeBase'
import { TreeNode, isTreeNode } from '../treeview/resourceTreeDataProvider'
import * as CloudFormation from '../cloudformation/cloudformation'
import fs from '../fs/fs'

/**
 * @description Finds the samconfig.toml file under the provided project folder
 * @param projectRoot The root folder of the application project
 * @returns The URI of the samconfig.toml file
 */
export async function getConfigFileUri(projectRoot: vscode.Uri): Promise<vscode.Uri> {
    const samConfigFilename = 'samconfig.toml'
    const samConfigPath = path.join(projectRoot.path, samConfigFilename)
    if (await fs.exists(samConfigPath)) {
        return vscode.Uri.file(samConfigPath)
    } else {
        throw new ToolkitError(`No samconfig.toml file found in ${projectRoot.fsPath}`, { code: 'samNoConfigFound' })
    }
}

/**
 * @description determines the root directory of the project given uri of the template file
 * @param template The template.yaml uri
 * @returns The URI of the root project folder (may differ from workspace)
 * */
export const getProjectRootUri = (templateUri: vscode.Uri) => vscode.Uri.file(path.dirname(templateUri.path))

export function getSource(arg: vscode.Uri | AWSTreeNodeBase | TreeNode | undefined): string | undefined {
    if (arg instanceof vscode.Uri) {
        return 'template'
    } else if (arg instanceof AWSTreeNodeBase) {
        return 'regionNode'
    } else if (isTreeNode(arg)) {
        return 'appBuilderDeploy'
    } else {
        return undefined
    }
}

export async function isDotnetRuntime(templateUri: vscode.Uri): Promise<boolean> {
    const samTemplate = await CloudFormation.tryLoad(templateUri)

    if (!samTemplate.template?.Resources) {
        return false
    }
    for (const resource of Object.values(samTemplate.template.Resources)) {
        if (resource?.Type === 'AWS::Serverless::Function') {
            if (resource.Properties?.Runtime && resource.Properties?.Runtime.startsWith('dotnet')) {
                return true
            }
        }
    }
    const globalRuntime = samTemplate.template.Globals?.Function?.Runtime as string
    return globalRuntime ? globalRuntime.startsWith('dotnet') : false
}
