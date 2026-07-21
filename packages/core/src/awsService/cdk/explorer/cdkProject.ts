/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import fs from '../../../shared/fs/fs'
import { ConstructTree } from './tree/types'
import { fetchConstructSourceMap, type ConstructSourceInfo } from './sourceLinks'

export interface CdkApp {
    location: CdkAppLocation
    constructTree: ConstructTree
    /** Construct path -> resolved source/template info, from the CDK language server. Absent when unavailable. */
    sourceMap?: ReadonlyMap<string, ConstructSourceInfo>
}

export interface CdkAppLocation {
    cdkJsonUri: vscode.Uri
    treeUri: vscode.Uri
}

export async function getApp(location: CdkAppLocation): Promise<CdkApp> {
    const constructTree = JSON.parse(await fs.readFileText(location.treeUri)) as ConstructTree
    const sourceMap = await fetchConstructSourceMap()

    return { location, constructTree, sourceMap }
}
