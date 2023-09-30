/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import assert from 'assert'
import { handleExtraBrackets } from '../../../codewhisperer/util/closingBracketUtil'
import { openATextEditorWithText } from '../../testUtil'

// TODO: refactor test cases
describe('closingBracketUtil', function () {
    describe('handleExtraBrackets', function () {
        it('case 1 should remove extra closing', async function () {
            const leftContext = 'function add2Numbers('
            const rightContext = ')'
            const recommendation = 'a: number, b: number) {\n    return a + b\n}'

            const editor = await openATextEditorWithText(leftContext + recommendation + rightContext, 'test.txt')

            await handleExtraBrackets(editor, recommendation, new vscode.Position(2, 1), new vscode.Position(0, 21))

            assert.strictEqual(
                editor.document.getText(),
                'function add2Numbers(a: number, b: number) {\n    return a + b\n}'
            )
        })

        it('case 2 should remove extra closing', async function () {
            const leftContext = 'function sum(a: number, b: number, '
            const rightContext = ')'
            const recommendation = 'c: number) {\n    return a + b + c\n}'

            const editor = await openATextEditorWithText(leftContext + recommendation + rightContext, 'test.txt')

            await handleExtraBrackets(editor, recommendation, new vscode.Position(2, 1), new vscode.Position(0, 35))

            assert.strictEqual(editor.document.getText(), leftContext + recommendation)
        })

        it('case 2 should not remove', async function () {
            const leftContext = 'function add2Numbers('
            const rightContext = ''
            const recommendation = 'a: number, b: number) {\n  return a + b;\n}'

            const editor = await openATextEditorWithText(leftContext + recommendation + rightContext, 'test.txt')

            // const pos = editor.document.positionAt(editor.document.getText().length)
            // editor.selection = new vscode.Selection(pos, pos)
            // await editor.edit(
            //     editBuilder => {
            //         editBuilder.insert(pos, rightContext)
            //     }
            // )

            await handleExtraBrackets(editor, recommendation, new vscode.Position(2, 1), new vscode.Position(0, 21))

            assert.strictEqual(editor.document.getText(), leftContext + recommendation + rightContext)
        })

        it('case 3 should not remove', async function () {
            const leftContext =
                'export const launchTemplates: { [key: string]: AmazonEC2.LaunchTemplate } = {\n    lt1: { launchTemplateId: "lt-1", launchTemplateName: "foo" },\n    lt2: { launchTemplateId: "lt-2345", launchTemplateName: "bar" },\n    lt3: '
            const rightContext = '\n};'
            const recommendation = '{ launchTemplateId: "lt-3456", launchTemplateName: "baz" },'

            const editor = await openATextEditorWithText(leftContext + recommendation + rightContext, 'test.txt')

            await handleExtraBrackets(editor, recommendation, new vscode.Position(3, 68), new vscode.Position(3, 9))

            assert.strictEqual(editor.document.getText(), leftContext + recommendation + rightContext)
        })

        it('case 4 should not remove', async function () {
            const leftContext =
                'export const launchTemplates: { [key: string]: AmazonEC2.LaunchTemplate } = {\n    lt1: { launchTemplateId: "lt-1", launchTemplateName: "foo" },\n    lt2: { launchTemplateId: "lt-2345", launchTemplateName: "bar" },\n    '
            const rightContext = '\n};'
            const recommendation = 'lt3: { launchTemplateId: "lt-3456", launchTemplateName: "baz" },'

            const editor = await openATextEditorWithText(leftContext + recommendation + rightContext, 'test.txt')

            await handleExtraBrackets(editor, recommendation, new vscode.Position(3, 68), new vscode.Position(3, 4))

            assert.strictEqual(editor.document.getText(), leftContext + recommendation + rightContext)
        })
    })
})
