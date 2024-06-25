/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { fsCommon } from '../../srcShared/fs'
import { openATextEditorWithText } from '../../test/testUtil'
import { makeTemporaryToolkitFolder } from '../../shared'
import vscode from 'vscode'
import { onASLInit } from '../../stepFunctions/asl/client'

describe('initialization', async function () {
    let tempFolder: string

    beforeEach(async function () {
        // Make a temp folder for all these tests
        tempFolder = await makeTemporaryToolkitFolder()
    })

    afterEach(async function () {
        await fsCommon.delete(tempFolder)
    })

    it('inits', async function () {
        const stateMachineFileText = `{

}`
        const fileName = 'stepfunction.asl'
        const editor = await openATextEditorWithText(stateMachineFileText, fileName, tempFolder)
        await new Promise(resolve => {
            onASLInit(() => {
                resolve(undefined)
            })
        })
        const result = (await vscode.commands.executeCommand(
            'vscode.executeCompletionItemProvider',
            editor.document.uri,
            new vscode.Position(1, 4)
        )) as vscode.CompletionList
        assert.deepStrictEqual(
            result.items.map(item => item.label),
            ['Comment', 'StartAt', 'States', 'TimeoutSeconds', 'Version']
        )
    })
})
