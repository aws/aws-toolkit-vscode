/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as del from 'del'
import * as path from 'path'
import { WorkspaceFolder } from 'vscode'
import { detectCdkProjects } from '../../cdk/explorer/detectCdkProjects'
import { createWorkspaceFolder } from '../lambda/local/util'

describe('detectCdkProjects', () => {
    const workspacePaths: string[] = []
    const workspaceFolders: WorkspaceFolder[] = []

    beforeEach(async () => {
        const { workspacePath, workspaceFolder } = await createWorkspaceFolder('vsctkcdk')

        workspacePaths.push(workspacePath)
        workspaceFolders.push(workspaceFolder)
    })

    afterEach(async () => {
        await del(workspacePaths, { force: true })

        workspacePaths.length = 0
        workspaceFolders.length = 0
    })

    it('detects no projects when workspaceFolders is undefined', async () => {
        const actual = await detectCdkProjects(undefined)

        assert.ok(actual)
        assert.strictEqual(actual.length, 0)
    })

    it('detects no projects when workspaceFolders is empty', async () => {
        const actual = await detectCdkProjects([])

        assert.ok(actual)
        assert.strictEqual(actual.length, 0)
    })

    it('detects no projects when tree.json does not exist', async () => {
        const actual = await detectCdkProjects(workspaceFolders)

        assert.ok(actual)
        assert.strictEqual(actual.length, 0)
    })
})
