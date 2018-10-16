/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import * as del from 'del'
import * as path from 'path'
import { Uri, WorkspaceFolder } from 'vscode'
import { selectLocalLambda } from '../../../lambda/local/selectLocalLambda'
import { createTemporaryDirectory, saveTemplate } from './util'

suite('selectLocalLambda tests', () => {
    let workspacePath: string | undefined
    let workspaceFolder: WorkspaceFolder | undefined
    let templatePath: string | undefined

    suiteSetup(async () => {
        workspacePath = await createTemporaryDirectory('vsctk')

        workspaceFolder = {
            uri: Uri.file(workspacePath),
            name: path.basename(workspacePath),
            index: 0
        }

        templatePath = path.join(workspaceFolder.uri.fsPath, 'template.yml')
        await saveTemplate(templatePath, 'MyFunction')
    })

    suiteTeardown(async () => {
        await del([ workspacePath! ], { force: true })
        workspacePath = undefined
        workspaceFolder = undefined
        templatePath = undefined
    })

    test('can select first lambda', async () => {
        let showQuickPickInvoked = false

        const actual = await selectLocalLambda(
            [ workspaceFolder! ],
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
            [ workspaceFolder! ],
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
