/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ToolkitError } from '../errors'
import path from 'path'
import { FileSystem } from '../fs/fs'
import { AWSTreeNodeBase } from '../treeview/nodes/awsTreeNodeBase'
import { TreeNode, isTreeNode } from '../treeview/resourceTreeDataProvider'

/**
 * @description Finds the samconfig.toml file under the provided project folder
 * @param projectRoot The root folder of the application project
 * @returns The URI of the samconfig.toml file
 */
export async function getConfigFileUri(projectRoot: vscode.Uri) {
    const samConfigFilename = 'samconfig.toml'
    let samConfigFile: string | undefined
    const fs = FileSystem.instance
    if (await fs.exists(path.join(projectRoot.path, samConfigFilename))) {
        samConfigFile = path.join(projectRoot.path, 'samconfig.toml')
    }
    if (samConfigFile) {
        return vscode.Uri.file(samConfigFile)
    } else {
        throw new ToolkitError(`No samconfig.toml file found in ${projectRoot.fsPath}`, { code: 'samNoConfigFound' })
    }
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
