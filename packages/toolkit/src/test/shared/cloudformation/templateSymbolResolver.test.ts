/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as vscode from 'vscode'
import {
    TemplateFunctionResource,
    TemplateSymbolProvider,
    TemplateSymbolResolver,
} from '../../../shared/cloudformation/templateSymbolResolver'
import { Stub, stub } from '../../utilities/stubber'

const range = new vscode.Range(0, 0, 0, 0)

const firstFunctionType = string('Type')
const firstFunction = module('Function1', [firstFunctionType])

const secondFunctionType = string('Type')
const secondFunction = module('Function2', [secondFunctionType])

const looksLikeFunctionType = string('Type')
const looksLikeFunction = module('LooksLikeFunction', [looksLikeFunctionType])

const symbols: vscode.DocumentSymbol[] = [
    module('Globals'),
    module('Resources', [
        firstFunction,
        module('NumberType', [number('Type')]),
        secondFunction,
        module('MissingType', [string('Missing')]),
        module('AnotherResource'),
        looksLikeFunction,
    ]),
]

function module(name: string, children: vscode.DocumentSymbol[] = []) {
    return symbol(name, vscode.SymbolKind.Module, children)
}

function string(name: string, children: vscode.DocumentSymbol[] = []) {
    return symbol(name, vscode.SymbolKind.String, children)
}

function number(name: string, children: vscode.DocumentSymbol[] = []) {
    return symbol(name, vscode.SymbolKind.Number, children)
}

function symbol(name: string, kind: vscode.SymbolKind, children: vscode.DocumentSymbol[] = []) {
    const newSymbol = new vscode.DocumentSymbol(name, 'detail', kind, range, range)
    newSymbol.children = children

    return newSymbol
}

describe('TemplateSymbolResolver', function () {
    let mockDocument: vscode.TextDocument

    let mockSymbolProvider: Stub<TemplateSymbolProvider>

    beforeEach(function () {
        mockDocument = {} as any as vscode.TextDocument
        mockSymbolProvider = stub(TemplateSymbolProvider)
        mockSymbolProvider.getSymbols.resolves(symbols)
        mockSymbolProvider.getText.callsFake((type, document) => {
            if (type === firstFunctionType) {
                return '"Type": "AWS::Serverless::Function"'
            } else if (type === secondFunctionType) {
                return 'Type: AWS::Serverless::Function'
            } else if (type === looksLikeFunctionType) {
                return 'Type: NotActuallyAFunction'
            }
            throw new Error('unexpected type for test')
        })
    })

    it('gets function resources', async function () {
        const symbolResolver = new TemplateSymbolResolver(mockDocument, mockSymbolProvider)
        const functionResources = await symbolResolver.getResourcesOfKind('function', false)

        const expectedResources: TemplateFunctionResource[] = [
            {
                name: firstFunction.name,
                range: firstFunction.range,
                kind: 'function',
            },
            {
                name: secondFunction.name,
                range: secondFunction.range,
                kind: 'function',
            },
        ]

        assert.deepStrictEqual(functionResources, expectedResources)
    })
})
