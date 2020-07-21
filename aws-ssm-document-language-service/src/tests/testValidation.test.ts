/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT
 */

import * as assert from 'assert'
import { Diagnostic, DiagnosticSeverity, Position, Range } from 'vscode-languageserver'
import { getLanguageServiceSSM } from '../service'
import * as exampleJsonDocs from './testDocuments/testJsonDocumentStrings'
import * as exampleYamlDocs from './testDocuments/testYamlDocumentStrings'
import { toDocument } from './util'

import { validateStepsNonCyclic } from '../validation/validate'
import { dfs, getOrderedSteps, Step } from '../validation/validateStepsNonCyclic'

export interface TestValidationOptions {
    ext: string // document extension .yaml || .json
    text: string // document text to test
    diagnostics: {
        // expected diagnostic
        message: string
        start: [number, number]
        end: [number, number]
    }[]
    filterMessage?: string[] // diagnostic messages that should appear,
}

async function getValidation(json: string, ext: string, type: string = 'command') {
    const { textDoc, jsonDoc } = toDocument(json, ext, type)
    const ls = getLanguageServiceSSM({})

    if (ext === 'json') {
        return await ls.doValidation(textDoc, jsonDoc)
    }

    return await ls.doValidation(textDoc)
}

async function testValidations(options: TestValidationOptions, type: string = 'command') {
    const { ext, text, diagnostics, filterMessage } = options
    let result = await getValidation(text, ext, type)

    // filterMessage shouldn't appear in diagnostic messages
    result = result.filter(diagnostic => {
        if (filterMessage && filterMessage.find(message => message === diagnostic.message)) {
            return false
        }

        return true
    })

    assert.strictEqual(result.length, diagnostics.length)
    // Compare each returned diagnostic with the expected diagnostic
    result.forEach((item, index) => {
        const startPos = Position.create(...diagnostics[index].start)
        const endPos = Position.create(...diagnostics[index].end)

        const expectedDiagnostic = Diagnostic.create(
            Range.create(startPos, endPos),
            diagnostics[index].message,
            DiagnosticSeverity.Error,
            undefined,
            'AWS Toolkit (Extension).'
        )

        assert.deepStrictEqual(item, expectedDiagnostic)
    })
}

suite('Test schemaVersion Validation', () => {
    test('JSON', async () => {
        await testValidations({
            ext: 'json',
            text: `{
                "schemaVersion": "0.4"
            }`,
            diagnostics: [
                {
                    message: 'Invalid schemaVersion for a command document.',
                    start: [1, 17],
                    end: [1, 30],
                },
            ],
        })
    })
    test('YAML', async () => {
        await testValidations({
            ext: 'yaml',
            text: `---
schemaVersion: '0.4'
`,
            diagnostics: [
                {
                    message: 'Invalid schemaVersion for a command document.',
                    start: [1, 0],
                    end: [1, 13],
                },
            ],
        })
    })
})

// Variable values are {{ ACTION.VAR }} strings in SSM Documet
// these variable values should follow rules
// 1. ACTION is an existing action
// 2. VAR is an existing input property or output value
suite('Test Variable Values Validation', () => {
    test('Missing ACTION', async () => {
        await testValidations(
            {
                ext: 'json',
                text: exampleJsonDocs.documentMissingAction.text,
                diagnostics: exampleJsonDocs.documentMissingAction.diagnostics,
            },
            'automation'
        )
    })
    test('Missing VAR property of ACTION', async () => {
        await testValidations(
            {
                ext: 'json',
                text: exampleJsonDocs.documentMissingActionValue.text,
                diagnostics: exampleJsonDocs.documentMissingActionValue.diagnostics,
            },
            'automation'
        )
    })
})

// Variable parameters are {{ VAR_NAME }} strings in SSM Document
// these VAR_NAMEs should appear under parameters
suite('Test Variable Parameter Validation', () => {
    suite('JSON', () => {
        test('No double brackets', async () => {
            await testValidations({
                ext: 'json',
                text: exampleJsonDocs.documentNoDoubleBracket.text,
                diagnostics: exampleJsonDocs.documentNoDoubleBracket.diagnostics,
            })
        })
        test('Missing the element "parameters"', async () => {
            await testValidations({
                ext: 'json',
                text: exampleJsonDocs.documentMissingParameters.text,
                diagnostics: exampleJsonDocs.documentMissingParameters.diagnostics,
            })
        })
        test('Missing one VAR_NAME under parameters', async () => {
            await testValidations({
                ext: 'json',
                text: exampleJsonDocs.documentMissingOneElementUnderParameters.text,
                diagnostics: exampleJsonDocs.documentMissingOneElementUnderParameters.diagnostics,
            })
        })
        test('Missing multiple VAR_NAMEs under parameters', async () => {
            await testValidations({
                ext: 'json',
                text: exampleJsonDocs.documentMissingMultipleElementsUnderParameters.text,
                diagnostics: exampleJsonDocs.documentMissingMultipleElementsUnderParameters.diagnostics,
            })
        })
    })
    suite('YAML', () => {
        test('No double brackets', async () => {
            await testValidations({
                ext: 'yaml',
                text: exampleYamlDocs.documentNoDoubleBracket.text,
                diagnostics: exampleYamlDocs.documentNoDoubleBracket.diagnostics,
            })
        })
        test('Missing the element "parameters"', async () => {
            await testValidations({
                ext: 'yaml',
                text: exampleYamlDocs.documentMissingParameters.text,
                diagnostics: exampleYamlDocs.documentMissingParameters.diagnostics,
            })
        })
        test('Missing one VAR_NAME under parameters', async () => {
            await testValidations({
                ext: 'yaml',
                text: exampleYamlDocs.documentMissingOneElementUnderParameters.text,
                diagnostics: exampleYamlDocs.documentMissingOneElementUnderParameters.diagnostics,
            })
        })
        test('Missing multiple VAR_NAMEs under parameters', async () => {
            await testValidations({
                ext: 'yaml',
                text: exampleYamlDocs.documentMissingMultipleElementsUnderParameters.text,
                diagnostics: exampleYamlDocs.documentMissingMultipleElementsUnderParameters.diagnostics,
            })
        })
    })
})

suite('Test cyclic action step validation', async () => {
    suite('Test helper functions', () => {
        const text = `{
            "schemaVersion": "0.3",
            "mainSteps": [
                {
                    "name": "pause1",
                    "action": "aws:pause",
                    "inputs": {}
                },
                {
                    "name": "pause2",
                    "action": "aws:pause",
                    "inputs": {}
                },
                {
                    "name": "pause3",
                    "action": "aws:pause",
                    "inputs": {},
                    "nextStep": "pause1"
                }
            ]
        }`
        const obj = JSON.parse(text)
        const res = getOrderedSteps(obj as { mainSteps: Step[] })
        test('getOrderedSteps', () => {
            const stepDict = new Map<string, Step>()
            // tslint:disable:no-string-literal
            stepDict['pause1'] = { next: ['pause2'], isEnd: false }
            stepDict['pause2'] = { next: ['pause3'], isEnd: false }
            stepDict['pause3'] = { next: ['pause1'], isEnd: false }

            assert.deepStrictEqual(res, {
                stepList: ['pause1', 'pause2', 'pause3'],
                stepDict: stepDict,
            })
        })
        test('dfs', () => {
            const visited: object = {}
            const recStack: object = {}
            const recUtil = {
                visited,
                recStack,
            }

            res.stepList.forEach(step => {
                recUtil.visited[step] = false
                recUtil.recStack[step] = false
            })

            assert.deepStrictEqual(dfs(res.stepList[0], res.stepDict, recUtil), true)
            assert.deepStrictEqual(dfs(res.stepList[1], res.stepDict, recUtil), false)
            assert.deepStrictEqual(dfs(res.stepList[2], res.stepDict, recUtil), false)
        })
        test('Simple Cycle', () => {
            const diagnostics = validateStepsNonCyclic(toDocument(text, 'json', 'automation').textDoc)
            assert.strictEqual(diagnostics.length, 1)
            assert.strictEqual(diagnostics[0].message, 'Action steps contain cycles.')
        })
    })
    suite('Other cycles', async () => {
        test('size 2 cycle', async () => {
            await testValidations(
                {
                    ext: 'json',
                    text: exampleJsonDocs.documentContainsSize2Cycle.text,
                    diagnostics: exampleJsonDocs.documentContainsSize2Cycle.diagnostics,
                },
                'automation'
            )
        })
        test('complicate cycle', async () => {
            await testValidations(
                {
                    ext: 'json',
                    text: exampleJsonDocs.documentContainsComplicateCycle.text,
                    diagnostics: exampleJsonDocs.documentContainsComplicateCycle.diagnostics,
                },
                'automation'
            )
        })
    })
})
