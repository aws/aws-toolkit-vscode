/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as del from 'del'
import * as path from 'path'
import { WorkspaceFolder } from 'vscode'
import { selectLocalLambda } from '../../../lambda/local/selectLocalLambda'
import { createWorkspaceFolder, saveTemplate } from './util'

describe('selectLocalLambda tests', () => {
    const workspacePaths: string[] = []
    const workspaceFolders: WorkspaceFolder[] = []
    let templatePath: string | undefined

    beforeEach(async () => {
        const { workspacePath, workspaceFolder } = await createWorkspaceFolder('vsctk')
        workspacePaths.push(workspacePath)
        workspaceFolders.push(workspaceFolder)

        templatePath = path.join(workspaceFolder.uri.fsPath, 'template.yml')
        await saveTemplate(templatePath, 'nodejs8.10', 'MyFunction')
    })

    afterEach(async () => {
        await del(workspacePaths, { force: true })
        workspacePaths.length = 0
        workspaceFolders.length = 0
        templatePath = undefined
    })

    it('returns selected lambda', async () => {
        let showQuickPickInvoked = false

        const actual = await selectLocalLambda(
            workspaceFolders,
            async (items, options, token) => {
                assert.strictEqual(showQuickPickInvoked, false)
                showQuickPickInvoked = true

                assert.ok(options)
                assert.strictEqual(options!.placeHolder, 'Select a lambda function')

                return Array.isArray(items) ? items[0] : (await items)[0]
            }
        )

        assert.ok(actual)
        assert.strictEqual(actual!.description, templatePath)
        assert.strictEqual(actual!.detail, undefined)
        assert.strictEqual(actual!.label, 'MyFunction')
        assert.strictEqual(actual!.lambda, 'MyFunction')
        assert.strictEqual(actual!.picked, undefined)
        assert.strictEqual(actual!.templatePath, templatePath)
    })

    it('returns undefined if no lambda selected', async () => {
        let showQuickPickInvoked = false

        const actual = await selectLocalLambda(
            workspaceFolders,
            async (items, options, token) => {
                assert.strictEqual(showQuickPickInvoked, false)
                showQuickPickInvoked = true

                assert.ok(options)
                assert.strictEqual(options!.placeHolder, 'Select a lambda function')

                return undefined
            }
        )

        assert.strictEqual(actual, undefined)
    })
})
