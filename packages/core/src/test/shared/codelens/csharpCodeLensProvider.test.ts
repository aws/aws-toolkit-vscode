/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs-extra'
import * as vscode from 'vscode'
import * as sampleDotNetSamProgram from './sampleDotNetSamProgram'

import { writeFile } from 'fs-extra'
import {
    DotNetLambdaHandlerComponents,
    generateDotNetLambdaHandler,
    getLambdaHandlerComponents,
    isPublicClassSymbol,
    isValidLambdaHandler,
} from '../../../shared/codelens/csharpCodeLensProvider'
import { makeTemporaryToolkitFolder } from '../../../shared/filesystemUtilities'

const fakeRange = new vscode.Range(0, 0, 0, 0)

describe('getLambdaHandlerComponents', async function () {
    let tempFolder: string

    beforeEach(async function () {
        // Make a temp folder for all these tests
        tempFolder = await makeTemporaryToolkitFolder()
    })

    afterEach(async function () {
        await fs.remove(tempFolder)
    })

    it('Detects a public function symbol', async function () {
        const programFile = path.join(tempFolder, 'program.cs')
        await writeFile(programFile, sampleDotNetSamProgram.getFunctionText())

        const textDoc = await vscode.workspace.openTextDocument(programFile)
        const documentSymbols = sampleDotNetSamProgram.getDocumentSymbols()
        const assembly = 'myAssembly'

        const componentsArray = getLambdaHandlerComponents(textDoc, documentSymbols, assembly)

        assert.ok(componentsArray)
        assert.strictEqual(componentsArray.length, 1, 'Expected only one set of Lambda Handler components')
        const components = componentsArray[0]
        assert.strictEqual(components.assembly, 'myAssembly', 'Unexpected Lambda Handler assembly')
        assert.strictEqual(components.namespace, 'HelloWorld', 'Unexpected Lambda Handler Namespace')
        assert.strictEqual(components.class, 'Function', 'Unexpected Lambda Handler Class')
        assert.strictEqual(components.method, 'FunctionHandler', 'Unexpected Lambda Handler Function')
    })
})

describe('isPublicClassSymbol', async function () {
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

        const isPublic = isPublicClassSymbol(doc, sampleClassSymbol)
        assert.strictEqual(isPublic, true, 'Expected symbol to be a public class')
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
                return 'public class Function {}'
            },
        }

        const isPublic = isPublicClassSymbol(doc, symbol)
        assert.strictEqual(isPublic, false, 'Expected symbol not to be a public class')
    })

    it('returns false when class is not public', async function () {
        const doc = {
            getText: (range?: vscode.Range): string => 'private class ',
        }

        const isPublic = isPublicClassSymbol(doc, sampleClassSymbol)
        assert.strictEqual(isPublic, false, 'Expected symbol not to be a public class')
    })
})

describe('isPublicMethodSymbol', async function () {
    const validPublicMethodTests = [
        {
            scenario: 'signature all on one line',
            functionHandler: generateFunctionHandler('FunctionHandler', 'APIGatewayProxyResponse', 'ILambdaContext'),
            functionSignatureParams: { access: 'public' },
        },
        {
            scenario: 'signature across many lines',
            functionHandler: generateFunctionHandler(
                'FunctionHandler',
                'APIGatewayProxyResponse',
                'ILambdaContext',
                true
            ),
            functionSignatureParams: { access: 'public', beforeFunctionName: true, afterSignature: true },
        },
        {
            scenario: 'method name on another line',
            functionHandler: generateFunctionHandler('FunctionHandler', 'APIGatewayProxyResponse', 'ILambdaContext'),
            functionSignatureParams: { access: 'public', beforeFunctionName: true },
        },
        {
            scenario: 'args on many lines',
            functionHandler: generateFunctionHandler(
                'FunctionHandler',
                'APIGatewayProxyResponse',
                'ILambdaContext',
                true
            ),
            functionSignatureParams: { access: 'public' },
        },
        {
            scenario: 'first arg is generic',
            functionHandler: generateFunctionHandler(
                'FunctionHandler',
                'APIGatewayProxyResponse<string, int, boolean>',
                'ILambdaContext'
            ),
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
        it(`returns true for a public method symbol when ${test.scenario}`, async () => {
            const doc = {
                getText: (range?: vscode.Range): string =>
                    generateFunctionDeclaration(
                        generateFunctionSignature(test.functionHandler, test.functionSignatureParams)
                    ),
            }

            const isPublic = isValidLambdaHandler(doc, sampleMethodSymbol)
            assert.strictEqual(isPublic, true, 'Expected symbol to be a public method')
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

        const isPublic = isValidLambdaHandler(doc, symbol)
        assert.strictEqual(isPublic, false, 'Expected symbol not to be a public method')
    })

    it('returns false when the method is not public', async function () {
        const handler = generateFunctionHandler('FunctionHandler', 'APIGatewayProxyResponse', 'ILambdaContext')
        const symbol = new vscode.DocumentSymbol(handler, '', vscode.SymbolKind.Method, fakeRange, fakeRange)
        const doc = {
            getText: (range?: vscode.Range): string =>
                generateFunctionDeclaration(
                    generateFunctionSignature(
                        generateFunctionHandler('FunctionHandler', 'APIGatewayProxyResponse', 'ILambdaContext'),
                        { access: 'private' }
                    )
                ),
        }

        const isPublic = isValidLambdaHandler(doc, symbol)
        assert.strictEqual(isPublic, false, 'Expected symbol not to be a public method')
    })

    it('returns false when a private method name contains the word public in it', async function () {
        const symbol = new vscode.DocumentSymbol('notpublicmethod', '', vscode.SymbolKind.Method, fakeRange, fakeRange)

        const doc = {
            getText: (range?: vscode.Range): string =>
                generateFunctionDeclaration(
                    generateFunctionSignature(
                        generateFunctionHandler('FunctionHandler', 'APIGatewayProxyResponse', 'ILambdaContext'),
                        { access: 'private' }
                    )
                ),
        }

        const isPublic = isValidLambdaHandler(doc, symbol)
        assert.strictEqual(isPublic, false, 'Expected symbol not to be a public method')
    })

    it('returns false when the second parameter is not an ILambdaContext', async function () {
        const symbol: vscode.DocumentSymbol = new vscode.DocumentSymbol(
            'FunctionHandler(APIGatewayProxyRequest apigProxyEvent, string context)',
            '',
            vscode.SymbolKind.Method,
            fakeRange,
            fakeRange
        )

        const doc = {
            getText: (range?: vscode.Range): string =>
                generateFunctionDeclaration(
                    generateFunctionSignature(
                        generateFunctionHandler('FunctionHandler', 'APIGatewayProxyResponse', 'string'),
                        { access: 'public' }
                    )
                ),
        }

        const isPublic = isValidLambdaHandler(doc, symbol)
        assert.strictEqual(isPublic, false, 'Expected symbol not to be a public method')
    })

    /**
     * Simulates the contents of a TextDocument that corresponds to a Method Symbol's range
     */
    function generateFunctionDeclaration(functionSignature: string): string {
        return `${functionSignature}
        {
            string location = GetCallingIP().Result;
            Dictionary<string, string> body = new Dictionary<string, string>
            {
                { "message", "hello world" },
                { "location", location },
            };

            return new APIGatewayProxyResponse
            {
                Body = JsonConvert.SerializeObject(body),
                StatusCode = 200,
                Headers = new Dictionary<string, string> { { "Content-Type", "application/json" } }
            };
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

        return `${params.access} APIGatewayProxyResponse ${beforeFunctionText}${functionHandler}${afterSignatureText}`
    }

    function generateFunctionHandler(
        functionName: string,
        param1: string,
        param2: string,
        beforeArgument: boolean = false
    ): string {
        const beforeArgumentText = beforeArgument ? os.EOL : ''

        return `${functionName}(${beforeArgumentText}${param1} apigProxyEvent, ${beforeArgumentText}${param2} context)`
    }
})

describe('generateDotNetLambdaHandler', async function () {
    it('produces a handler name', async function () {
        const components: DotNetLambdaHandlerComponents = {
            assembly: 'myAssembly',
            namespace: 'myNamespace',
            class: 'myClass',
            method: 'foo',
            handlerRange: undefined!,
        }

        const handlerName = generateDotNetLambdaHandler(components)
        assert.strictEqual(handlerName, 'myAssembly::myNamespace.myClass::foo', 'Handler name mismatch')
    })
})
