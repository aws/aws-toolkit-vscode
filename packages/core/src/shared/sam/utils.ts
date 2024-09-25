/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import path from 'path'
import { AWSTreeNodeBase } from '../treeview/nodes/awsTreeNodeBase'
import { TreeNode, isTreeNode } from '../treeview/resourceTreeDataProvider'
import * as CloudFormation from '../cloudformation/cloudformation'
import { TemplateItem } from './sync'

/**
 * @description determines the root directory of the project given Template Item
 * @param templateItem Template item object.
 * @returns The URI of the root project folder (may differ from workspace)
 * */
export const getProjectRoot = (template: TemplateItem | undefined) =>
    template ? getProjectRootUri(template.uri) : undefined

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
