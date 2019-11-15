/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs'
import * as vscode from 'vscode'
import { ConstructTree } from './tree/types'

export interface CdkProject {
    location: CdkProjectLocation
    metadata: ConstructTree
}

export interface CdkProjectLocation {
    workspaceFolder: vscode.WorkspaceFolder
    cdkJsonPath: string
    treePath: string
}

export async function getProject(location: CdkProjectLocation): Promise<CdkProject> {
    // TODO add guardrails around loading data
    const constructTree = JSON.parse(fs.readFileSync(location.treePath, 'utf-8')) as ConstructTree
    const project = { location: location, metadata: constructTree }

    return Promise.resolve(project as CdkProject)
}
