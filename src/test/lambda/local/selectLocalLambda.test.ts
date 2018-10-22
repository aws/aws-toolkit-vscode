/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import * as del from 'del'
import * as path from 'path'
import { WorkspaceFolder } from 'vscode'
import { selectLocalLambda } from '../../../lambda/local/selectLocalLambda'
import { createWorkspaceFolder, saveTemplate } from './util'

suite('selectLocalLambda tests', () => {
    const workspacePaths: string[] = []
    const workspaceFolders: WorkspaceFolder[] = []
    let templatePath: string | undefined

    setup(async () => {
        const { workspacePath, workspaceFolder } = await createWorkspaceFolder('vsctk')
        workspacePaths.push(workspacePath)
        workspaceFolders.push(workspaceFolder)

        templatePath = path.join(workspaceFolder.uri.fsPath, 'template.yml')
        await saveTemplate(templatePath, 'MyFunction')
    })

    teardown(async () => {
        await del(workspacePaths, { force: true })
        workspacePaths.length = 0
        workspaceFolders.length = 0
        templatePath = undefined
    })

    test('can select first lambda', async () => {
        let showQuickPickInvoked = false

        const actual = await selectLocalLambda(
            workspaceFolders,
            async (items, options, token) => {
                assert.equal(showQuickPickInvoked, false)
                showQuickPickInvoked = true

                assert.ok(options)
                assert.equal(options!.placeHolder, 'Select a lambda function')

                return Array.isArray(items) ? items[0] : (await items)[0]
            }
        )

        assert.ok(actual)
        assert.equal(actual!.description, templatePath)
        assert.equal(actual!.detail, undefined)
        assert.equal(actual!.label, 'MyFunction')
        assert.equal(actual!.lambda, 'MyFunction')
        assert.equal(actual!.picked, undefined)
        assert.equal(actual!.templatePath, templatePath)
    })

    test('can cancel without selecting a lambda', async () => {
        let showQuickPickInvoked = false

        const actual = await selectLocalLambda(
            workspaceFolders,
            async (items, options, token) => {
                assert.equal(showQuickPickInvoked, false)
                showQuickPickInvoked = true

                assert.ok(options)
                assert.equal(options!.placeHolder, 'Select a lambda function')

                return undefined
            }
        )

        assert.equal(actual, undefined)
    })
})
