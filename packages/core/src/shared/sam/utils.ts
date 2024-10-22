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
/**
 * Returns if a corresponding SAM template (received as a URI or string content) has
 * any function using .NET runtime
 * @param path A uri with the absolute path to the template file
 * @param contents The contents of the template file, directly as a string
 */
export async function isDotnetRuntime(templateUri: vscode.Uri, contents?: string): Promise<boolean> {
    const samTemplate = await CloudFormation.tryLoad(templateUri, contents)

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

// Quickpick items from the Sync flags prompter
export const syncFlagsItems = [
    {
        label: 'Build in source',
        data: '--build-in-source',
        description: 'Opts in to build project in the source folder. Only for node apps',
    },
    {
        label: 'Code',
        data: '--code',
        description: 'Sync only code resources (Lambda Functions, API Gateway, Step Functions)',
    },
    {
        label: 'Dependency layer',
        data: '--dependency-layer',
        description: 'Separate dependencies of individual function into Lambda layers',
    },
    {
        label: 'Skip deploy sync',
        data: '--skip-deploy-sync',
        description: "This will skip the initial infrastructure deployment if it's not required",
    },
    {
        label: 'Use container',
        data: '--use-container',
        description: 'Build functions with an AWS Lambda-like container',
    },
    {
        label: 'Watch',
        data: '--watch',
        description: 'Watch local files and automatically sync with cloud',
    },
    {
        label: 'Save parameters',
        data: '--save-params',
        description: 'Save to samconfig.toml as default parameters',
    },
    {
        label: 'Beta features',
        data: '--beta-features',
        description: 'Enable beta features',
    },
    {
        label: 'Debug',
        data: '--debug',
        description: 'Turn on debug logging to print debug messages and display timestamps',
    },
]
