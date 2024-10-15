/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import fs from '../../../shared/fs/fs'
import { ConstructTree } from './tree/types'

export interface CdkApp {
    location: CdkAppLocation
    constructTree: ConstructTree
}

export interface CdkAppLocation {
    cdkJsonUri: vscode.Uri
    treeUri: vscode.Uri
}

export async function getApp(location: CdkAppLocation): Promise<CdkApp> {
    const constructTree = JSON.parse(await fs.readFileText(location.treeUri)) as ConstructTree

    return { location, constructTree }
}
