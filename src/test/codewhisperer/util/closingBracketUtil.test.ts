/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import assert from 'assert'
import { handleExtraBrackets } from '../../../codewhisperer/util/closingBracketUtil'
import { openATextEditorWithText } from '../../testUtil'

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
            /**
             * public class Main {
             *     public static void main(|)
             * }
             */
            await assertClosingSymbolsHandler(
                String.raw`public class Main {
    public static void main(`,
                String.raw`)
}`,
                String.raw`args: String[]) {
        System.out.println("Hello World");
    }`,
                String.raw`public class Main {
    public static void main(args: String[]) {
        System.out.println("Hello World");
    }
}`
            )

            /**
             * function add2Numbers(a: number: b: number) {
             *     return a + b
             * })
             */
            await assertClosingSymbolsHandler(
                'function add2Numbers(',
                ')',
                'a: number, b: number) {\n    return a + b\n}',
                `function add2Numbers(a: number, b: number) {\n    return a + b\n}`
            )

            /**
             * function sum(a: number, b: number, c: number) {
             *     return a + b + c
             * })
             */
            await assertClosingSymbolsHandler(
                'function sum(a: number, b: number, ',
                ')',
                'c: number) {\n    return a + b + c\n}',
                `function sum(a: number, b: number, c: number) {\n    return a + b + c\n}`
            )

            /**
             * const aString = "hello world";"
             */
            await assertClosingSymbolsHandler(
                'const aString = "',
                '"',
                'hello world";',
                `const aString = "hello world";`
            )

            /**
             * {
             *     "userName": "john",
             *     "department": "codewhisperer"",
             * }
             */
            await assertClosingSymbolsHandler(
                '{\n\t"userName": "john",\n\t"',
                '"\n}',
                'department": "codewhisperer",',
                '{\n\t"userName": "john",\n\t"department": "codewhisperer",\n}'
            )

            /**
             * const someArray = ["element1", "element2"]];
             */
            await assertClosingSymbolsHandler(
                'const anArray = [',
                ']',
                '"element1", "element2"];',
                `const anArray = ["element1", "element2"];`
            )

            await assertClosingSymbolsHandler(
                String.raw`genericFunction<`,
                String.raw`> () {
    if (T isInstanceOf string) {
        console.log(T)
    } else {
        // Do nothing
    }
}`,
                'T>',
                String.raw`genericFunction<T> () {
    if (T isInstanceOf string) {
        console.log(T)
    } else {
        // Do nothing
    }
}`
            )

            await assertClosingSymbolsHandler(
                'const rawStr = String.raw`',
                '`',
                'Foo`;',
                `const rawStr = String.raw\`Foo\`;`
            )
        })

        it('should not remove extra closing symbol', async function () {
            await assertClosingSymbolsHandler(
                'function add2Numbers(',
                '',
                'a: number, b: number) {\n  return a + b;\n}',
                `function add2Numbers(a: number, b: number) {\n  return a + b;\n}`
            )

            /**
             * export const launchTemplates: { [key: string]: AmazonEC2.LaunchTemplate } = {
             *     lt1: { launchTemplateId: "lt-1", launchTemplateName: "foo" },
             *     lt2: { launchTemplateId: "lt-2345", launchTemplateName: "bar" },
             *     lt3: { launchTemplateId: "lt-3456", launchTemplateName: "baz" },
             * }
             */
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

            await assertClosingSymbolsHandler(
                'const aString = "',
                '',
                'hello world";',
                'const aString = "hello world";'
            )

            await assertClosingSymbolsHandler(
                'genericFunction<',
                String.raw` {
    if (T isInstanceOf string) {
        console.log(T)
    } else {
        // Do nothing
    }
}`,
                'T> ()',
                String.raw`genericFunction<T> () {
    if (T isInstanceOf string) {
        console.log(T)
    } else {
        // Do nothing
    }
}`
            )

            await assertClosingSymbolsHandler(
                'const rawStr = String.raw`',
                '',
                'Foo`;',
                `const rawStr = String.raw\`Foo\`;`
            )
        })
    })
})
