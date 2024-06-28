/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { createTestWorkspaceFolder, openATextEditorWithText } from '../../test/testUtil'
import vscode from 'vscode'
import { ASLLanguageClient } from '../../stepFunctions/asl/client'

describe('stepFunctions ASL LSP', async function () {
    let tempFolder: string

    beforeEach(async function () {
        // Make a temp folder for all these tests
        const d = await createTestWorkspaceFolder()
        tempFolder = d.uri.fsPath
    })

    it('init', async function () {
        const stateMachineFileText = `{

}`
        const fileName = 'stepfunction.asl'
        console.log('creating the listening promise')
        const promise2 = new Promise(resolve => {
            console.log('promise created')
            ASLLanguageClient.onASLInit(() => {
                console.log('resolve called')
                resolve(undefined)
            })
        })
        console.log('opening the editor')
        const editor = await openATextEditorWithText(stateMachineFileText, fileName, tempFolder)
        console.log('waiting for the promise')
        await promise2
        console.log('finished waiting for the project')
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
