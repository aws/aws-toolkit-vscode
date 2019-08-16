/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as path from 'path'
import * as vscode from 'vscode'
import { LambdaHandlerCandidate } from '../shared/lambdaHandlerSearch'
import { TypescriptLambdaHandlerSearch } from '../shared/typescriptLambdaHandlerSearch'

describe('TypescriptLambdaHandlerSearch', () => {
    it('finds export declared functions in Typescript code', async () => {
        const filename: string = path.join(getSamplesFolder(), 'typescript', 'sampleFunctions.ts')

        const expectedHandlerNames: Set<string> = new Set([
            'sampleFunctions.exportedFunctionWithNoArgs',
            'sampleFunctions.exportedFunctionWithOneArg',
            'sampleFunctions.exportedFunctionWithTwoArgs',
            'sampleFunctions.exportedFunctionWithThreeArgs',
            'sampleFunctions.exportedViaDeclaration',
            'sampleFunctions.exportedArrowFunction',
            'sampleFunctions.exportedArrowViaDeclaration',
            'sampleFunctions.exportedArrowViaDeclarationAlt'
        ])

        await testTypescriptLambdaHandlerSearch(filename, expectedHandlerNames)
    })

    it('ignores class declarations in Typescript code', async () => {
        const filename: string = path.join(getSamplesFolder(), 'typescript', 'sampleClasses.ts')

        const expectedHandlerNames: Set<string> = new Set(['sampleClasses.exportedFunctionWithNoArgs'])

        await testTypescriptLambdaHandlerSearch(filename, expectedHandlerNames)
    })

    it('ignores interface declarations in Typescript code', async () => {
        const filename: string = path.join(getSamplesFolder(), 'typescript', 'sampleInterfaces.ts')

        const expectedHandlerNames: Set<string> = new Set(['sampleInterfaces.exportedFunctionWithNoArgs'])

        await testTypescriptLambdaHandlerSearch(filename, expectedHandlerNames)
    })

    it('finds module.exports declared functions in javascript code', async () => {
        const filename: string = path.join(getSamplesFolder(), 'javascript', 'sampleFunctions.js')

        const expectedHandlerNames: Set<string> = new Set([
            'sampleFunctions.exportedFunctionWithNoArgs',
            'sampleFunctions.exportedFunctionWithOneArg',
            'sampleFunctions.exportedFunctionWithTwoArgs',
            'sampleFunctions.exportedFunctionWithThreeArgs',
            'sampleFunctions.anotherExportedFunctionWithNoArgs',
            'sampleFunctions.directExportsArrowFunction',
            'sampleFunctions.directExportsArrowFunctionAsync',
            'sampleFunctions.directExportsFunction',
            'sampleFunctions.directExportsFunctionAsync'
        ])

        await testTypescriptLambdaHandlerSearch(filename, expectedHandlerNames)
    })

    it('ignores class declarations in javascript code', async () => {
        const filename: string = path.join(getSamplesFolder(), 'javascript', 'sampleClasses.js')

        const expectedHandlerNames: Set<string> = new Set(['sampleClasses.exportedFunctionWithNoArgs'])

        await testTypescriptLambdaHandlerSearch(filename, expectedHandlerNames)
    })

    async function testTypescriptLambdaHandlerSearch(
        filename: string,
        expectedHandlerNames: Set<string>
    ): Promise<void> {
        const search: TypescriptLambdaHandlerSearch = new TypescriptLambdaHandlerSearch(vscode.Uri.file(filename))

        const handlers: LambdaHandlerCandidate[] = await search.findCandidateLambdaHandlers()

        assertCandidateHandlers(handlers, expectedHandlerNames)
    }

    function getSamplesFolder(): string {
        return path.join(__dirname, '..', '..', '..', 'src', 'test', 'samples')
    }

    function assertCandidateHandlers(actual: LambdaHandlerCandidate[], expectedHandlerNames: Set<string>) {
        assert.strictEqual(actual.length, expectedHandlerNames.size)
        assert.strictEqual(
            actual.map(handler => handler.handlerName).every(handlerName => expectedHandlerNames.has(handlerName)),
            true
        )
    }
})
