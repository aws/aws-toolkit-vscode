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
    /**
     *             leftContext + recommendation + rightContext
     * startStart             start            end              endEnd
     */
    describe('handleExtraBrackets', function () {
        async function assertClosingSymbolsHandler(
            leftContext: string,
            rightContext: string,
            recommendation: string,
            expected: string
        ) {
            const editor = await openATextEditorWithText(leftContext + recommendation + rightContext, 'test.txt')
            const document = editor.document

            const startStart = document.positionAt(0)
            const endEnd = document.positionAt(editor.document.getText().length)
            const start = document.positionAt(leftContext.length)
            const end = document.positionAt(leftContext.length + recommendation.length)

            const left = document.getText(new vscode.Range(startStart, start))
            const right = document.getText(new vscode.Range(end, endEnd))
            const reco = document.getText(new vscode.Range(start, end))

            assert.strictEqual(left, leftContext)
            assert.strictEqual(right, rightContext)
            assert.strictEqual(reco, recommendation)

            await handleExtraBrackets(editor, recommendation, end, start)

            assert.strictEqual(editor.document.getText(), expected)
        }

        it('should remove extra closing symbol', async function () {
            await assertClosingSymbolsHandler(
                'function add2Numbers(',
                ')',
                'a: number, b: number) {\n    return a + b\n}',
                `function add2Numbers(a: number, b: number) {\n    return a + b\n}`
            )

            await assertClosingSymbolsHandler(
                'function sum(a: number, b: number, ',
                ')',
                'c: number) {\n    return a + b + c\n}',
                `function sum(a: number, b: number, c: number) {\n    return a + b + c\n}`
            )

            await assertClosingSymbolsHandler(
                'const aString = "',
                '"',
                'hello world";',
                `const aString = "hello world";`
            )
        })

        it('should not remove extra closing symbol', async function () {
            await assertClosingSymbolsHandler(
                'function add2Numbers(',
                '',
                'a: number, b: number) {\n  return a + b;\n}',
                `function add2Numbers(a: number, b: number) {\n  return a + b;\n}`
            )

            await assertClosingSymbolsHandler(
                'export const launchTemplates: { [key: string]: AmazonEC2.LaunchTemplate } = {\n    lt1: { launchTemplateId: "lt-1", launchTemplateName: "foo" },\n    lt2: { launchTemplateId: "lt-2345", launchTemplateName: "bar" },\n    lt3: ',
                '\n};',
                '{ launchTemplateId: "lt-3456", launchTemplateName: "baz" },',
                `export const launchTemplates: { [key: string]: AmazonEC2.LaunchTemplate } = {\n    lt1: { launchTemplateId: "lt-1", launchTemplateName: "foo" },\n    lt2: { launchTemplateId: "lt-2345", launchTemplateName: "bar" },\n    lt3: { launchTemplateId: "lt-3456", launchTemplateName: "baz" },\n};`
            )

            await assertClosingSymbolsHandler(
                'export const launchTemplates: { [key: string]: AmazonEC2.LaunchTemplate } = {\n    lt1: { launchTemplateId: "lt-1", launchTemplateName: "foo" },\n    lt2: { launchTemplateId: "lt-2345", launchTemplateName: "bar" },\n    ',
                '\n};',
                'lt3: { launchTemplateId: "lt-3456", launchTemplateName: "baz" },',
                'export const launchTemplates: { [key: string]: AmazonEC2.LaunchTemplate } = {\n    lt1: { launchTemplateId: "lt-1", launchTemplateName: "foo" },\n    lt2: { launchTemplateId: "lt-2345", launchTemplateName: "bar" },\n    lt3: { launchTemplateId: "lt-3456", launchTemplateName: "baz" },\n};'
            )
        })
    })
})
