/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import { Uri, WorkspaceFolder } from 'vscode'
import { makeTemporaryToolkitFolder } from '../../shared/filesystemUtilities'

export async function createWorkspaceFolder(
    prefix: string
): Promise<{
    workspacePath: string
    workspaceFolder: WorkspaceFolder
}> {
    const workspacePath = await makeTemporaryToolkitFolder(prefix, 'cdk.out')

    return {
        workspacePath,
        workspaceFolder: {
            uri: Uri.file(workspacePath),
            name: path.basename(workspacePath),
            index: 0
        }
    }
}
