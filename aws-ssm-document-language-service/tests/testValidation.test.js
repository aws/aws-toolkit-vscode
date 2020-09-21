'use strict'
/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT
 */
var __createBinding =
    (this && this.__createBinding) ||
    (Object.create
        ? function(o, m, k, k2) {
              if (k2 === undefined) k2 = k
              Object.defineProperty(o, k2, {
                  enumerable: true,
                  get: function() {
                      return m[k]
                  },
              })
          }
        : function(o, m, k, k2) {
              if (k2 === undefined) k2 = k
              o[k2] = m[k]
          })
var __setModuleDefault =
    (this && this.__setModuleDefault) ||
    (Object.create
        ? function(o, v) {
              Object.defineProperty(o, 'default', { enumerable: true, value: v })
          }
        : function(o, v) {
              o['default'] = v
          })
var __importStar =
    (this && this.__importStar) ||
    function(mod) {
        if (mod && mod.__esModule) return mod
        var result = {}
        if (mod != null)
            for (var k in mod)
                if (k !== 'default' && Object.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k)
        __setModuleDefault(result, mod)
        return result
    }
var __awaiter =
    (this && this.__awaiter) ||
    function(thisArg, _arguments, P, generator) {
        function adopt(value) {
            return value instanceof P
                ? value
                : new P(function(resolve) {
                      resolve(value)
                  })
        }
        return new (P || (P = Promise))(function(resolve, reject) {
            function fulfilled(value) {
                try {
                    step(generator.next(value))
                } catch (e) {
                    reject(e)
                }
            }
            function rejected(value) {
                try {
                    step(generator['throw'](value))
                } catch (e) {
                    reject(e)
                }
            }
            function step(result) {
                result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected)
            }
            step((generator = generator.apply(thisArg, _arguments || [])).next())
        })
    }
Object.defineProperty(exports, '__esModule', { value: true })
const assert = __importStar(require('assert'))
const vscode_languageserver_1 = require('vscode-languageserver')
const service_1 = require('../service')
const exampleJsonDocs = __importStar(require('./testDocuments/testJsonDocumentStrings'))
const exampleYamlDocs = __importStar(require('./testDocuments/testYamlDocumentStrings'))
const util_1 = require('./util')
const validate_1 = require('../validation/validate')
const validateStepsNonCyclic_1 = require('../validation/validateStepsNonCyclic')
function getValidation(json, ext, type = 'command') {
    return __awaiter(this, void 0, void 0, function*() {
        const { textDoc, jsonDoc } = util_1.toDocument(json, ext, type)
        const ls = service_1.getLanguageServiceSSM({})
        if (ext === 'json') {
            return yield ls.doValidation(textDoc, jsonDoc)
        }
        return yield ls.doValidation(textDoc)
    })
}
function testValidations(options, type = 'command') {
    return __awaiter(this, void 0, void 0, function*() {
        const { ext, text, diagnostics, filterMessage } = options
        let result = yield getValidation(text, ext, type)
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
            const startPos = vscode_languageserver_1.Position.create(...diagnostics[index].start)
            const endPos = vscode_languageserver_1.Position.create(...diagnostics[index].end)
            const expectedDiagnostic = vscode_languageserver_1.Diagnostic.create(
                vscode_languageserver_1.Range.create(startPos, endPos),
                diagnostics[index].message,
                vscode_languageserver_1.DiagnosticSeverity.Error,
                undefined,
                'AWS Toolkit (Extension).'
            )
            assert.deepStrictEqual(item, expectedDiagnostic)
        })
    })
}
suite('Test schemaVersion Validation', () => {
    test('JSON', () =>
        __awaiter(void 0, void 0, void 0, function*() {
            yield testValidations({
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
        }))
    test('YAML', () =>
        __awaiter(void 0, void 0, void 0, function*() {
            yield testValidations({
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
        }))
})
// Variable values are {{ ACTION.VAR }} strings in SSM Documet
// these variable values should follow rules
// 1. ACTION is an existing action
// 2. VAR is an existing input property or output value
suite('Test Variable Values Validation', () => {
    test('Missing ACTION', () =>
        __awaiter(void 0, void 0, void 0, function*() {
            yield testValidations(
                {
                    ext: 'json',
                    text: exampleJsonDocs.documentMissingAction.text,
                    diagnostics: exampleJsonDocs.documentMissingAction.diagnostics,
                },
                'automation'
            )
        }))
    test('Missing VAR property of ACTION', () =>
        __awaiter(void 0, void 0, void 0, function*() {
            yield testValidations(
                {
                    ext: 'json',
                    text: exampleJsonDocs.documentMissingActionValue.text,
                    diagnostics: exampleJsonDocs.documentMissingActionValue.diagnostics,
                },
                'automation'
            )
        }))
})
// Variable parameters are {{ VAR_NAME }} strings in SSM Document
// these VAR_NAMEs should appear under parameters
suite('Test Variable Parameter Validation', () => {
    suite('JSON', () => {
        test('No double brackets', () =>
            __awaiter(void 0, void 0, void 0, function*() {
                yield testValidations({
                    ext: 'json',
                    text: exampleJsonDocs.documentNoDoubleBracket.text,
                    diagnostics: exampleJsonDocs.documentNoDoubleBracket.diagnostics,
                })
            }))
        test('Missing the element "parameters"', () =>
            __awaiter(void 0, void 0, void 0, function*() {
                yield testValidations({
                    ext: 'json',
                    text: exampleJsonDocs.documentMissingParameters.text,
                    diagnostics: exampleJsonDocs.documentMissingParameters.diagnostics,
                })
            }))
        test('Missing one VAR_NAME under parameters', () =>
            __awaiter(void 0, void 0, void 0, function*() {
                yield testValidations({
                    ext: 'json',
                    text: exampleJsonDocs.documentMissingOneElementUnderParameters.text,
                    diagnostics: exampleJsonDocs.documentMissingOneElementUnderParameters.diagnostics,
                })
            }))
        test('Missing multiple VAR_NAMEs under parameters', () =>
            __awaiter(void 0, void 0, void 0, function*() {
                yield testValidations({
                    ext: 'json',
                    text: exampleJsonDocs.documentMissingMultipleElementsUnderParameters.text,
                    diagnostics: exampleJsonDocs.documentMissingMultipleElementsUnderParameters.diagnostics,
                })
            }))
    })
    suite('YAML', () => {
        test('No double brackets', () =>
            __awaiter(void 0, void 0, void 0, function*() {
                yield testValidations({
                    ext: 'yaml',
                    text: exampleYamlDocs.documentNoDoubleBracket.text,
                    diagnostics: exampleYamlDocs.documentNoDoubleBracket.diagnostics,
                })
            }))
        test('Missing the element "parameters"', () =>
            __awaiter(void 0, void 0, void 0, function*() {
                yield testValidations({
                    ext: 'yaml',
                    text: exampleYamlDocs.documentMissingParameters.text,
                    diagnostics: exampleYamlDocs.documentMissingParameters.diagnostics,
                })
            }))
        test('Missing one VAR_NAME under parameters', () =>
            __awaiter(void 0, void 0, void 0, function*() {
                yield testValidations({
                    ext: 'yaml',
                    text: exampleYamlDocs.documentMissingOneElementUnderParameters.text,
                    diagnostics: exampleYamlDocs.documentMissingOneElementUnderParameters.diagnostics,
                })
            }))
        test('Missing multiple VAR_NAMEs under parameters', () =>
            __awaiter(void 0, void 0, void 0, function*() {
                yield testValidations({
                    ext: 'yaml',
                    text: exampleYamlDocs.documentMissingMultipleElementsUnderParameters.text,
                    diagnostics: exampleYamlDocs.documentMissingMultipleElementsUnderParameters.diagnostics,
                })
            }))
    })
})
suite('Test cyclic action step validation', () =>
    __awaiter(void 0, void 0, void 0, function*() {
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
            const res = validateStepsNonCyclic_1.getOrderedSteps(obj)
            test('getOrderedSteps', () => {
                const stepDict = new Map()
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
                const visited = {}
                const recStack = {}
                const recUtil = {
                    visited,
                    recStack,
                }
                res.stepList.forEach(step => {
                    recUtil.visited[step] = false
                    recUtil.recStack[step] = false
                })
                assert.deepStrictEqual(validateStepsNonCyclic_1.dfs(res.stepList[0], res.stepDict, recUtil), true)
                assert.deepStrictEqual(validateStepsNonCyclic_1.dfs(res.stepList[1], res.stepDict, recUtil), false)
                assert.deepStrictEqual(validateStepsNonCyclic_1.dfs(res.stepList[2], res.stepDict, recUtil), false)
            })
            test('Simple Cycle', () => {
                const diagnostics = validate_1.validateStepsNonCyclic(
                    util_1.toDocument(text, 'json', 'automation').textDoc
                )
                assert.strictEqual(diagnostics.length, 1)
                assert.strictEqual(diagnostics[0].message, 'Action steps contain cycles.')
            })
        })
        suite('Other cycles', () =>
            __awaiter(void 0, void 0, void 0, function*() {
                test('size 2 cycle', () =>
                    __awaiter(void 0, void 0, void 0, function*() {
                        yield testValidations(
                            {
                                ext: 'json',
                                text: exampleJsonDocs.documentContainsSize2Cycle.text,
                                diagnostics: exampleJsonDocs.documentContainsSize2Cycle.diagnostics,
                            },
                            'automation'
                        )
                    }))
                test('complicate cycle', () =>
                    __awaiter(void 0, void 0, void 0, function*() {
                        yield testValidations(
                            {
                                ext: 'json',
                                text: exampleJsonDocs.documentContainsComplicateCycle.text,
                                diagnostics: exampleJsonDocs.documentContainsComplicateCycle.diagnostics,
                            },
                            'automation'
                        )
                    }))
            })
        )
    })
)
//# sourceMappingURL=testValidation.test.js.map
