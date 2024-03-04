/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as fs from 'fs-extra'
import * as os from 'os'
import * as path from 'path'
import * as vscode from 'vscode'
import {
    generateJavaLambdaHandler,
    getLambdaHandlerComponents,
    isValidClassSymbol,
    isValidLambdaHandler,
    JavaLambdaHandlerComponents,
} from '../../../shared/codelens/javaCodeLensProvider'
import { makeTemporaryToolkitFolder } from '../../../shared/filesystemUtilities'
import * as SampleJavaSamProgram from './sampleJavaSamProgram'

const fakeRange = new vscode.Range(0, 0, 0, 0)

describe('javaCodeLensProvider', () => {
    describe('getLambdaHandlerComponents', () => {
        let tempFolder: string

        beforeEach(async () => {
            // Make a temp folder for all these tests
            tempFolder = await makeTemporaryToolkitFolder()
        })

        afterEach(async () => {
            await fs.remove(tempFolder)
        })

        it('Detects a public function symbol', async function () {
            const programFile = path.join(tempFolder, 'App.java')
            await fs.writeFile(programFile, SampleJavaSamProgram.getFunctionText())

            const textDoc = await vscode.workspace.openTextDocument(programFile)
            const documentSymbols = SampleJavaSamProgram.getDocumentSymbols()

            const componentsArray = getLambdaHandlerComponents(textDoc, documentSymbols)

            assert.ok(componentsArray)
            assert.strictEqual(componentsArray.length, 1, 'Expected only one set of Lambda Handler components')
            const components = componentsArray[0]
            assert.strictEqual(components.package, 'helloworld', 'Unexpected Lambda Handler Package')
            assert.strictEqual(components.class, 'App', 'Unexpected Lambda Handler Class')
            assert.strictEqual(components.method, 'handleRequest', 'Unexpected Lambda Handler Function')
        })
    })

    describe('isValidClassSymbol', () => {
        const sampleClassSymbol: vscode.DocumentSymbol = new vscode.DocumentSymbol(
            'HelloWorld.Function',
            '',
            vscode.SymbolKind.Class,
            fakeRange,
            fakeRange
        )

        it('returns true for a public class', async function () {
            const doc = {
                getText: (range?: vscode.Range): string => {
                    return 'public class Function {}'
                },
            }

            assert.strictEqual(isValidClassSymbol(doc, sampleClassSymbol), true, 'Expected symbol to be a public class')
        })

        it('returns false when symbol is not of type Class', async function () {
            const symbol = new vscode.DocumentSymbol(
                sampleClassSymbol.name,
                sampleClassSymbol.detail,
                vscode.SymbolKind.Method,
                sampleClassSymbol.range,
                sampleClassSymbol.selectionRange
            )

            const doc = {
                getText: (range?: vscode.Range): string => {
                    return 'public method Function {}'
                },
            }

            assert.strictEqual(isValidClassSymbol(doc, symbol), false, 'Expected symbol not to be a public class')
        })

        it('returns false when class is not public', async function () {
            const doc = {
                getText: (range?: vscode.Range): string => 'private class Function {}',
            }

            assert.strictEqual(
                isValidClassSymbol(doc, sampleClassSymbol),
                false,
                'Expected symbol not to be a public class'
            )
        })

        it('returns false when class is abstract', async function () {
            const doc = {
                getText: (range?: vscode.Range): string => 'public abstract class Function {}',
            }

            assert.strictEqual(
                isValidClassSymbol(doc, sampleClassSymbol),
                false,
                'Expected symbol not to be a public class'
            )
        })
    })

    describe('isValidMethodSignature/isValidLambdaHandler', () => {
        const validPublicMethodTests = [
            {
                scenario: 'signature all on one line',
                functionHandlerParams: {
                    name: 'FunctionHandler',
                    args: [
                        { name: 'param1', type: 'String' },
                        { name: 'ctx', type: 'Context' },
                    ],
                },
                functionSignatureParams: { access: 'public' },
            },
            {
                scenario: 'signature across many lines',
                functionHandlerParams: {
                    name: 'FunctionHandler',
                    args: [
                        { name: 'param1', type: 'String' },
                        { name: 'ctx', type: 'Context' },
                    ],
                    beforeArg: true,
                },
                functionSignatureParams: { access: 'public', beforeFunctionName: true, afterSignature: true },
            },
            {
                scenario: 'method name on another line',
                functionHandlerParams: {
                    name: 'FunctionHandler',
                    args: [
                        { name: 'param1', type: 'String' },
                        { name: 'ctx', type: 'Context' },
                    ],
                    beforeArg: true,
                },
                functionSignatureParams: { access: 'public', beforeFunctionName: true },
            },
            {
                scenario: 'args on many lines',
                functionHandlerParams: {
                    name: 'FunctionHandler',
                    args: [
                        { name: 'param1', type: 'String' },
                        { name: 'ctx', type: 'Context' },
                    ],
                    beforeArg: true,
                },
                functionSignatureParams: { access: 'public' },
            },
            {
                scenario: 'first arg is generic',
                functionHandlerParams: {
                    name: 'FunctionHandler',
                    args: [
                        { name: 'param1', type: 'Foo<Asdf, Jkl>' },
                        { name: 'ctx', type: 'Context' },
                    ],
                    beforeArg: true,
                },
                functionSignatureParams: { access: 'public' },
            },
            {
                scenario: 'only one arg is present',
                functionHandlerParams: {
                    name: 'FunctionHandler',
                    args: [{ name: 'param1', type: 'String' }],
                    beforeArg: true,
                },
                functionSignatureParams: { access: 'public' },
            },
            {
                scenario: 'an input and output stream are present with no context',
                functionHandlerParams: {
                    name: 'FunctionHandler',
                    args: [
                        { name: 'param1', type: 'InputStream' },
                        { name: 'param2', type: 'OutputStream' },
                    ],
                    beforeArg: true,
                },
                functionSignatureParams: { access: 'public' },
            },
            {
                scenario: 'three params are present',
                functionHandlerParams: {
                    name: 'FunctionHandler',
                    args: [
                        { name: 'param1', type: 'InputStream' },
                        { name: 'param2', type: 'OutputStream' },
                        { name: 'ctx', type: 'Context' },
                    ],
                    beforeArg: true,
                },
                functionSignatureParams: { access: 'public' },
            },
        ]

        validPublicMethodTests.forEach(test => {
            const sampleMethodSymbol: vscode.DocumentSymbol = new vscode.DocumentSymbol(
                'FunctionHandler(APIGatewayProxyRequest apigProxyEvent, ILambdaContext context)',
                '',
                vscode.SymbolKind.Method,
                fakeRange,
                fakeRange
            )
            it(`returns true for a public method symbol when ${test.scenario}`, async function () {
                const doc = {
                    getText: (range?: vscode.Range): string =>
                        generateFunctionDeclaration(
                            generateFunctionSignature(
                                generateFunctionHandler(
                                    test.functionHandlerParams.name,
                                    test.functionHandlerParams.args,
                                    test.functionHandlerParams.beforeArg
                                ),
                                test.functionSignatureParams
                            )
                        ),
                }

                const isValid = isValidLambdaHandler(doc, sampleMethodSymbol)
                assert.strictEqual(isValid, true, 'Expected symbol to be a valid method')
            })
        })

        it('returns false for a symbol that is not a method', async function () {
            const symbol = new vscode.DocumentSymbol(
                'FunctionHandler(APIGatewayProxyRequest apigProxyEvent, ILambdaContext context)',
                '',
                vscode.SymbolKind.Class,
                fakeRange,
                fakeRange
            )

            const doc = {
                getText: (range?: vscode.Range): string => {
                    throw new Error('getText is unused')
                },
            }

            const isValid = isValidLambdaHandler(doc, symbol)
            assert.strictEqual(isValid, false, 'Expected symbol not to be a public method')
        })

        it('returns false when the method is not public', async function () {
            const handler = generateFunctionHandler('FunctionHandler', [
                { name: 'param1', type: 'String' },
                { name: 'ctx', type: 'Context' },
            ])
            const symbol = new vscode.DocumentSymbol(handler, '', vscode.SymbolKind.Method, fakeRange, fakeRange)
            const doc = {
                getText: (range?: vscode.Range): string =>
                    generateFunctionDeclaration(generateFunctionSignature(handler, { access: 'private' })),
            }

            const isValid = isValidLambdaHandler(doc, symbol)
            assert.strictEqual(isValid, false, 'Expected symbol not to be a public method')
        })

        it('returns false when a private method name contains the word public in it', async function () {
            const symbol = new vscode.DocumentSymbol(
                'notpublicmethod',
                '',
                vscode.SymbolKind.Method,
                fakeRange,
                fakeRange
            )

            const doc = {
                getText: (range?: vscode.Range): string =>
                    generateFunctionDeclaration(
                        generateFunctionSignature(
                            generateFunctionHandler('FunctionHandler', [
                                { name: 'param1', type: 'String' },
                                { name: 'ctx', type: 'Context' },
                            ]),
                            { access: 'private' }
                        )
                    ),
            }

            const isValid = isValidLambdaHandler(doc, symbol)
            assert.strictEqual(isValid, false, 'Expected symbol not to be a public method')
        })

        it('returns false when the second parameter is not a Context AND the params are not input and output streams', async function () {
            failedHandlerRunner(
                generateFunctionHandler('FunctionHandler', [
                    { name: 'param1', type: 'String' },
                    { name: 'ctx', type: 'int' },
                ])
            )
        })

        it('returns false when one param is a stream and the other is not', async function () {
            const testHandlers = [
                generateFunctionHandler('FunctionHandler', [
                    { name: 'param1', type: 'int' },
                    { name: 'param2', type: 'OutputStream' },
                ]),
                generateFunctionHandler('FunctionHandler', [
                    { name: 'param1', type: 'InputStream' },
                    { name: 'param2', type: 'int' },
                ]),
            ]
            for (const test of testHandlers) {
                failedHandlerRunner(test)
            }
        })

        it('returns false when any combination of three parameters is not two streams and a context', async function () {
            const testHandlers = [
                generateFunctionHandler('FunctionHandler', [
                    { name: 'param1', type: 'InputStream' },
                    { name: 'param2', type: 'OutputStream' },
                    { name: 'ctx', type: 'int' },
                ]),
                generateFunctionHandler('FunctionHandler', [
                    { name: 'param1', type: 'int' },
                    { name: 'param2', type: 'OutputStream' },
                    { name: 'ctx', type: 'Context' },
                ]),
                generateFunctionHandler('FunctionHandler', [
                    { name: 'param1', type: 'InputStream' },
                    { name: 'param2', type: 'int' },
                    { name: 'ctx', type: 'Context' },
                ]),
            ]

            for (const test of testHandlers) {
                failedHandlerRunner(test)
            }
        })

        it('returns false with more than three parameters', async function () {
            failedHandlerRunner(
                generateFunctionHandler('FunctionHandler', [
                    { name: 'param1', type: 'InputStream' },
                    { name: 'param2', type: 'OutputStream' },
                    { name: 'ctx', type: 'Context' },
                    { name: 'silly', type: 'Whatever' },
                ])
            )
        })

        it('returns false with zero parameters', async function () {
            failedHandlerRunner(generateFunctionHandler('FunctionHandler', []))
        })
    })

    describe('generateJavaLambdaHandler', () => {
        it('produces a handler name', async function () {
            const components: JavaLambdaHandlerComponents = {
                package: 'package',
                class: 'myClass',
                method: 'foo',
                handlerRange: undefined!,
            }

            const handlerName = generateJavaLambdaHandler(components)
            assert.strictEqual(handlerName, 'package.myClass::foo', 'Handler name mismatch')
        })
    })

    function failedHandlerRunner(handler: string) {
        const symbol: vscode.DocumentSymbol = new vscode.DocumentSymbol(
            handler,
            '',
            vscode.SymbolKind.Method,
            fakeRange,
            fakeRange
        )

        const doc = {
            getText: (range?: vscode.Range): string =>
                generateFunctionDeclaration(generateFunctionSignature(handler, { access: 'public' })),
        }

        const isValid = isValidLambdaHandler(doc, symbol)
        assert.strictEqual(isValid, false)
    }

    function generateFunctionDeclaration(functionSignature: string): string {
        return `${functionSignature} {
            Map<String, String> headers = new HashMap<>();
            headers.put("Content-Type", "application/json");
            headers.put("X-Custom-Header", "application/json");
    
            APIGatewayProxyResponseEvent response = new APIGatewayProxyResponseEvent()
                    .withHeaders(headers);
            try {
                final String pageContents = this.getPageContents("https://checkip.amazonaws.com");
                String output = String.format("{ \"message\": \"hello world\", \"location\": \"%s\" }", pageContents);
    
                return response
                        .withStatusCode(200)
                        .withBody(output);
            } catch (IOException e) {
                return response
                        .withBody("{}")
                        .withStatusCode(500);
            }
        }
`
    }

    /**
     * Simulates the Function signature portion of the contents of a TextDocument that corresponds
     * to a Method Symbol's range. Used with generateFunctionDeclaration.
     */
    function generateFunctionSignature(
        functionHandler: string,
        params: {
            access: string
            beforeFunctionName?: boolean
            afterSignature?: boolean
        }
    ): string {
        const beforeFunctionText = params.beforeFunctionName ? os.EOL : ''
        const afterSignatureText = params.afterSignature ? os.EOL : ''

        return `${params.access} APIGatewayProxyResponseEvent ${beforeFunctionText}${functionHandler}${afterSignatureText}`
    }

    function generateFunctionHandler(
        functionName: string,
        params: {
            type: string
            name: string
        }[],
        beforeArgument: boolean = false
    ): string {
        const beforeArgumentText = beforeArgument ? os.EOL : ''
        const paramsString = params.map(curr => `${beforeArgumentText}${curr.type} ${curr.name}`).join(', ')

        return `${functionName}(${paramsString})`
    }
})
