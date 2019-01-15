/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import {
    types as vscode,
    VSCodeContext,
    WindowNamespace
} from '../../../shared/vscode'
import '../../shared/vscode/initialize'

import * as assert from 'assert'
import * as del from 'del'
import * as path from 'path'
import { selectLocalLambda } from '../../../lambda/local/selectLocalLambda'
import { ext } from '../../../shared/extensionGlobals'
import { createWorkspaceFolder, saveTemplate } from './util'

describe('selectLocalLambda', () => {
    const workspacePaths: string[] = []
    const workspaceFolders: vscode.WorkspaceFolder[] = []
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

        ext.vscode = {
            ...ext.vscode,
            window: {
                showQuickPick: async (
                    items: any[] | Thenable<any[]>,
                    options:
                        vscode.QuickPickOptions |
                        (vscode.QuickPickOptions & { canPickMany: true })
                ) => {
                    assert.strictEqual(showQuickPickInvoked, false)
                    showQuickPickInvoked = true

                    assert.ok(options)
                    assert.strictEqual(options!.placeHolder, 'Select a lambda function')

                    return (await Promise.resolve(items))[0]
                }
            } as any as WindowNamespace
        } as any as VSCodeContext

        const actual = await selectLocalLambda(workspaceFolders)

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
        ext.vscode = {
            ...ext.vscode,
            window: {
                showQuickPick: async (
                    items: any,
                    options:
                        vscode.QuickPickOptions |
                        (vscode.QuickPickOptions & { canPickMany: true })
                ) => {
                    assert.strictEqual(showQuickPickInvoked, false)
                    showQuickPickInvoked = true

                    assert.ok(options)
                    assert.strictEqual(options!.placeHolder, 'Select a lambda function')

                    return undefined
                }
            } as any as WindowNamespace
        } as any as VSCodeContext

        const actual = await selectLocalLambda(workspaceFolders)

        assert.strictEqual(actual, undefined)
    })
})
