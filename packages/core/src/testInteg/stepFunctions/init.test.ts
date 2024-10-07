/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { createTestWorkspaceFolder, toTextEditor } from '../../test/testUtil'
import vscode from 'vscode'
import { ASLLanguageClient } from '../../stepFunctions/asl/client'
import { waitUntil } from '../../shared'

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
        const editor = await toTextEditor(stateMachineFileText, fileName, tempFolder)
        await waitUntil(async () => ASLLanguageClient.isReady, {
            timeout: 30000,
            interval: 500,
        })
        const result = (await vscode.commands.executeCommand(
            'vscode.executeCompletionItemProvider',
            editor.document.uri,
            new vscode.Position(1, 4)
        )) as vscode.CompletionList
        assert.deepStrictEqual(
            result.items.map((item) => item.label),
            ['Comment', 'StartAt', 'States', 'TimeoutSeconds', 'Version']
        )
    })
})
