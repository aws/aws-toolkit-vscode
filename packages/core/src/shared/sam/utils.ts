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
import { getLogger } from '../logger'

/**
 * @description Finds the samconfig.toml file under the provided project folder
 * @param projectRoot The root folder of the application project
 * @returns The URI of the samconfig.toml file
 */
export async function getConfigFileUri(projectRoot: vscode.Uri): Promise<vscode.Uri> {
    const samConfigFilename = 'samconfig.toml'
    try {
        return await getFile(projectRoot, samConfigFilename)
    } catch (error) {
        throw new ToolkitError(`Encountered error when retriving samconfig.toml in ${projectRoot.fsPath}`, {
            code: 'samNoConfigFound',
        })
    }
}

/**
 * @description Finds the template.yaml file under the provided project folder
 * @param projectRoot The root folder of the application project
 * @returns The URI of the template.yaml file
 */
export async function getTemplateFileUri(projectRoot: vscode.Uri) {
    const templateFile = 'template.{yaml,yml}'
    try {
        return await getFile(projectRoot, templateFile)
    } catch (error) {
        throw new ToolkitError(`Encountered error when retriving template file found in ${projectRoot.fsPath}`, {
            code: 'samTemplateFileIssue',
        })
    }
}
/**
 * @description Searches for a file matching a specified pattern within a given project root directory.
 * @param projectRoot - The URI of the root directory to start the search from.
 * @param filenamePattern - A glob pattern to match filenames against.
 * @returns A Promise that a single of URI despite potential multiple the matching files.
 */
export async function getFile(projectRoot: vscode.Uri, filenamePattern: string) {
    const relativePattern = new vscode.RelativePattern(projectRoot, filenamePattern)
    const files = await vscode.workspace.findFiles(relativePattern)
    if (files.length < 1) {
        getLogger().error(`getFile: Cannot find ${filenamePattern} in ${projectRoot}`)
        throw new ToolkitError(`No ${filenamePattern} found in in ${projectRoot.fsPath}`, {
            code: 'noFileFound',
        })
    } else if (files.length > 1) {
        getLogger().warn(`getFile: Multiple match for  ${filenamePattern} in the ${projectRoot}`)
    }
    return files[0]
}

/**
 * @description determines the root directory of the project given uri of the template file
 * @param template The template.yaml uri
 * @returns The URI of the root project folder (may differ from workspace)
 * */
export const getProjectRootUri = (templateUri: vscode.Uri) => vscode.Uri.file(path.dirname(templateUri.path))

/**
 * @description Retrieves the root folders of all SAM template files (template.yaml or template.yml)
 *              in the current workspace.
 * @returns A Promise that resolves to an array of vscode.Uri objects, each representing a project root folder.
 *          If no workspace folders are open, it returns an empty array.
 * @remarks
 * - The function excludes searching in 'node_modules' and '.aws-sam' directories.
 * - It considers the parent directory of each template file as a project root.
 */
export async function getProjectRootFoldersInWorkspace(): Promise<vscode.Uri[]> {
    if (!vscode.workspace.workspaceFolders) {
        return []
    }
    const templateFiles = await vscode.workspace.findFiles('**/template.{yaml,yml}', '**/{node_modules,.aws-sam}/**')
    const projectRootFolders = []

    for (const templateFile of templateFiles) {
        const rootFolder = vscode.Uri.parse(path.dirname(templateFile.fsPath))
        projectRootFolders.push(rootFolder)
    }

    return projectRootFolders
}

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
