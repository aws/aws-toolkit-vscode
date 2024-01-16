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

            await handleExtraBrackets(editor, end, start)

            assert.strictEqual(editor.document.getText(), expected)
        }

        it('should remove extra closing symbol', async function () {
            /**
             * public static void mergeSort(int[|] nums) {
             *      mergeSort(nums, 0, nums.length - 1);
             * }|])
             */
            await assertClosingSymbolsHandler(
                String.raw`public static void mergeSort(int[`,
                String.raw`])`,
                String.raw`] nums) {
    mergeSort(nums, 0, nums.length - 1);
}`,
                String.raw`public static void mergeSort(int[] nums) {
    mergeSort(nums, 0, nums.length - 1);
}`
            )

            /**
             * fun genericFunction<|T>(value: T): T {
             *     return value
             * }|>
             */
            await assertClosingSymbolsHandler(
                String.raw`fun genericFunction<`,
                String.raw`>`,
                String.raw`T>(value: T): T {
    return value
}`,
                String.raw`fun genericFunction<T>(value: T): T {
    return value
}`
            )

            /**
             * function getProperty<T, |K extends keyof T>(obj: T, key: K) {|>
             */
            await assertClosingSymbolsHandler(
                String.raw`function getProperty<T, `,
                String.raw`>`,
                String.raw`K extends keyof T>(obj: T, key: K) {`,
                String.raw`function getProperty<T, K extends keyof T>(obj: T, key: K) {`
            )

            /**
             * public class Main {
             *     public static void main(|args: String[]) {
             *         System.out.println("Hello World");
             *     }|)
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
             * const someArray = [|"element1", "element2"];|]
             */
            await assertClosingSymbolsHandler(
                'const anArray = [',
                ']',
                '"element1", "element2"];',
                `const anArray = ["element1", "element2"];`
            )

            /**
             * export const launchTemplates: { [key: string]: AmazonEC2.LaunchTemplate } = {
             *      lt1: { launchTemplateId: "lt-1", launchTemplateName: "foo" },
             *      lt2: { launchTemplateId: "lt-2345", launchTemplateName: "bar" },
             *      lt3: { |launchTemplateId: "lt-678919", launchTemplateName: "foobar" },|
             * };
             */
            await assertClosingSymbolsHandler(
                String.raw`export const launchTemplates: { [key: string]: AmazonEC2.LaunchTemplate } = {
                lt1: { launchTemplateId: "lt-1", launchTemplateName: "foo" },
                lt2: { launchTemplateId: "lt-2345", launchTemplateName: "bar" },
                lt3: { `,
                String.raw`
            };`,
                String.raw`launchTemplateId: "lt-678919", launchTemplateName: "foobar" },`,
                String.raw`export const launchTemplates: { [key: string]: AmazonEC2.LaunchTemplate } = {
                lt1: { launchTemplateId: "lt-1", launchTemplateName: "foo" },
                lt2: { launchTemplateId: "lt-2345", launchTemplateName: "bar" },
                lt3: { launchTemplateId: "lt-678919", launchTemplateName: "foobar" },
            };`
            )

            /**
             * genericFunction<|T>|> () {
             *     if (T isInstanceOf string) {
             *         console.log(T)
             *     } else {
             *         // Do nothing
             *     }
             * }
             */
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

            /**
             * const rawStr = "|Foo";|"
             * const anotherStr = "Bar"
             */
            await assertClosingSymbolsHandler(
                'const rawStr = "',
                '\nconst anotherStr = "Bar";',
                'Foo";',
                String.raw`const rawStr = "Foo";
const anotherStr = "Bar";`
            )
        })

        it('should not remove extra closing symbol', async function () {
            /**
             * describe('Foo', () => {
             *      describe('Bar', function () => {
             *          it('Boo', |() => {
             *              expect(true).toBe(true)
             *          }|)
             *      })
             * })
             */
            await assertClosingSymbolsHandler(
                String.raw`describe('Foo', () => {
    describe('Bar', function () {
        it('Boo', `,
                String.raw`)
    })
})`,
                String.raw`() => {
            expect(true).toBe(true)
        }`,
                String.raw`describe('Foo', () => {
    describe('Bar', function () {
        it('Boo', () => {
            expect(true).toBe(true)
        })
    })
})`
            )

            /**
             * function add2Numbers(|a: nuumber, b: number) {
             *     return a + b;
             * }|
             */
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
             *     lt3: |{ launchTemplateId: "lt-3456", launchTemplateName: "baz" },|
             * }
             */
            await assertClosingSymbolsHandler(
                'export const launchTemplates: { [key: string]: AmazonEC2.LaunchTemplate } = {\n    lt1: { launchTemplateId: "lt-1", launchTemplateName: "foo" },\n    lt2: { launchTemplateId: "lt-2345", launchTemplateName: "bar" },\n    lt3: ',
                '\n};',
                '{ launchTemplateId: "lt-3456", launchTemplateName: "baz" },',
                `export const launchTemplates: { [key: string]: AmazonEC2.LaunchTemplate } = {\n    lt1: { launchTemplateId: "lt-1", launchTemplateName: "foo" },\n    lt2: { launchTemplateId: "lt-2345", launchTemplateName: "bar" },\n    lt3: { launchTemplateId: "lt-3456", launchTemplateName: "baz" },\n};`
            )

            /**
             * export const launchTemplates: { [key: string]: AmazonEC2.LaunchTemplate } = {
             *     lt1: { launchTemplateId: "lt-1", launchTemplateName: "foo" },
             *     lt2: { launchTemplateId: "lt-2345", launchTemplateName: "bar" },
             *     |lt3: { launchTemplateId: "lt-3456", launchTemplateName: "baz" },|
             * }
             */
            await assertClosingSymbolsHandler(
                'export const launchTemplates: { [key: string]: AmazonEC2.LaunchTemplate } = {\n    lt1: { launchTemplateId: "lt-1", launchTemplateName: "foo" },\n    lt2: { launchTemplateId: "lt-2345", launchTemplateName: "bar" },\n    ',
                '\n};',
                'lt3: { launchTemplateId: "lt-3456", launchTemplateName: "baz" },',
                'export const launchTemplates: { [key: string]: AmazonEC2.LaunchTemplate } = {\n    lt1: { launchTemplateId: "lt-1", launchTemplateName: "foo" },\n    lt2: { launchTemplateId: "lt-2345", launchTemplateName: "bar" },\n    lt3: { launchTemplateId: "lt-3456", launchTemplateName: "baz" },\n};'
            )

            /**
             * const aString = "|hello world";|
             */
            await assertClosingSymbolsHandler(
                'const aString = "',
                '',
                'hello world";',
                'const aString = "hello world";'
            )

            /** genericFunction<|T> ()|> {
             *      if (T isInstanceOf string) {
             *          console.log(T)
             *      } else {
             *          // Do nothing
             *      }
             * }
             */
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

            /**
             * const rawStr = "|Foo";|
             * const anotherStr = "Bar"
             */
            await assertClosingSymbolsHandler(
                'const rawStr = "',
                String.raw`
const anotherStr = "Bar";`,
                'Foo";',
                String.raw`const rawStr = "Foo";
const anotherStr = "Bar";`
            )

            /**
             * function shouldReturnAhtmlDiv( { name } : Props) {
             *      if (!name) {
             *          return undefined
             *      }
             *
             *      return (
             *          <div className = { name |}>
             *              { name }
             *          </div>
             *      |)
             * }
             */
            await assertClosingSymbolsHandler(
                String.raw`function shouldReturnAhtmlDiv( { name } : Props) {
    if (!name) {
        return undefined
    }

    return (
        <div className = { 'foo' `,
                String.raw`
    )
}`,
                String.raw`}>
            { name }
        </div>`,
                String.raw`function shouldReturnAhtmlDiv( { name } : Props) {
    if (!name) {
        return undefined
    }

    return (
        <div className = { 'foo' }>
            { name }
        </div>
    )
}`
            )
        })
    })
})
