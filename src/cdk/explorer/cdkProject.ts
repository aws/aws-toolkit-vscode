/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { readFileAsString } from '../../shared/filesystemUtilities'
import { ConstructTree } from './tree/types'

export interface CdkApp {
    location: CdkAppLocation
    metadata: ConstructTree
}

export interface CdkAppLocation {
    workspaceFolder: vscode.WorkspaceFolder
    cdkJsonPath: string
    treePath: string
}

export async function getApp(location: CdkAppLocation): Promise<CdkApp> {
    const constructTree = JSON.parse(await readFileAsString(location.treePath)) as ConstructTree

    return { location: location, metadata: constructTree }
}
