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
var __importDefault =
    (this && this.__importDefault) ||
    function(mod) {
        return mod && mod.__esModule ? mod : { default: mod }
    }
Object.defineProperty(exports, '__esModule', { value: true })
const assert = __importStar(require('assert'))
const vscode_json_languageservice_1 = require('vscode-json-languageservice')
const parameterObject_json_1 = __importDefault(require('../json-schema/partial/parameterObject.json'))
const automationSnippets_json_1 = __importDefault(require('../json-schema/partial/snippets/automationSnippets.json'))
const commandSnippets_json_1 = __importDefault(require('../json-schema/partial/snippets/commandSnippets.json'))
const ssmSchema = __importStar(require('../json-schema/ssmdocschema.json'))
const service_1 = require('../service')
const util_1 = require('./util')
const YAML = __importStar(require('yaml'))
const s = ssmSchema
function getCompletions(json, position, ext, type) {
    return __awaiter(this, void 0, void 0, function*() {
        const { textDoc, jsonDoc } = util_1.toDocument(json, ext, type)
        const pos = service_1.JsonLS.Position.create(...position)
        const ls = service_1.getLanguageServiceSSM({})
        return yield ls.doComplete(textDoc, pos, jsonDoc)
    })
}
function testActionSnippetCompletion(options, type = 'command') {
    return __awaiter(this, void 0, void 0, function*() {
        const { ext, labels, docText, position, insertTexts } = options
        const result = yield getCompletions(docText, position, ext, type)
        result.items = result.items.filter(item => {
            if (item.kind === vscode_json_languageservice_1.CompletionItemKind.Value) {
                return item
            }
        })
        if (ext === 'yaml') {
            console.log(result)
        }
        assert.strictEqual(result === null || result === void 0 ? void 0 : result.items.length, labels.length)
        assert.deepStrictEqual(
            result.items.map(item => item.label),
            labels
        )
        if (insertTexts && !!result.items.length && !!result.items[0].insertText) {
            assert.deepStrictEqual(
                result.items.map(item => item.insertText),
                insertTexts
            )
        }
    })
}
function testParameterSnippetCompletesion(options, type = 'command') {
    return __awaiter(this, void 0, void 0, function*() {
        const { ext, labels, docText, position, insertTexts } = options
        const result = yield getCompletions(docText, position, ext, type)
        result.items = result.items.filter(item => {
            if (
                item.kind === vscode_json_languageservice_1.CompletionItemKind.Snippet ||
                item.kind === vscode_json_languageservice_1.CompletionItemKind.Module
            ) {
                return item
            }
        })
        assert.strictEqual(result === null || result === void 0 ? void 0 : result.items.length, labels.length)
        assert.deepStrictEqual(
            result.items.map(item => item.label),
            labels
        )
    })
}
function testPropertyCompletion(options, type = 'command') {
    return __awaiter(this, void 0, void 0, function*() {
        const { ext, labels, docText, position, insertTexts, textEdits } = options
        const result = yield getCompletions(docText, position, ext, type)
        result.items = result.items.filter(item => {
            if (item.kind === vscode_json_languageservice_1.CompletionItemKind.Property) {
                return item
            }
        })
        assert.strictEqual(result === null || result === void 0 ? void 0 : result.items.length, labels.length)
        assert.deepStrictEqual(result.items.map(item => item.label).sort(), labels.sort())
        if (insertTexts) {
            assert.deepStrictEqual(
                result.items
                    .map(item => {
                        const str = item.insertText
                        const colon = str.indexOf(':')
                        if (colon !== -1) {
                            return str.substring(0, colon)
                        }
                        return str
                    })
                    .sort(),
                insertTexts.sort()
            )
        }
        if (textEdits) {
            assert.deepStrictEqual(
                result.items
                    .map(item => {
                        return item.textEdit
                    })
                    .sort(),
                textEdits.sort()
            )
        }
    })
}
const topLevelElements = ['runtimeConfig', 'mainSteps', 'files', 'outputs', 'description', 'assumeRole', 'parameters']
suite('Test Top Level Elements Completion', () => {
    const labels = topLevelElements.filter(item => item !== 'schemaVersion')
    suite('JSON', () => {
        test('No schemaVersion', () =>
            __awaiter(void 0, void 0, void 0, function*() {
                yield testPropertyCompletion({
                    ext: 'json',
                    labels: ['schemaVersion'],
                    docText: `{
                    "
                }`,
                    position: [1, 5],
                    insertTexts: ['"schemaVersion"'],
                })
            }))
        test('Valid schemaVersion', () =>
            __awaiter(void 0, void 0, void 0, function*() {
                yield testPropertyCompletion({
                    ext: 'json',
                    labels: labels,
                    docText: `{
                    "schemaVersion": "2.2",
                    "
                }`,
                    position: [2, 5],
                    insertTexts: labels.map(item => {
                        return `"${item}"`
                    }),
                })
            }))
    })
    suite('YAML', () => {
        test('No schemaVersion', () =>
            __awaiter(void 0, void 0, void 0, function*() {
                yield testPropertyCompletion({
                    ext: 'yaml',
                    labels: ['schemaVersion'],
                    docText: `---
s`,
                    position: [1, 1],
                    insertTexts: ['schemaVersion'],
                })
            }))
        test('Valid schemaVersion', () =>
            __awaiter(void 0, void 0, void 0, function*() {
                yield testPropertyCompletion({
                    ext: 'yaml',
                    labels: labels,
                    docText: `---
schemaVersion: '2.2'
`,
                    position: [2, 1],
                    insertTexts: labels,
                })
            }))
    })
})
suite('Test Parameter Name Completion', () => {
    suite('JSON', () =>
        __awaiter(void 0, void 0, void 0, function*() {
            test('No variable parameters', () =>
                __awaiter(void 0, void 0, void 0, function*() {
                    yield testPropertyCompletion({
                        ext: 'json',
                        labels: [],
                        docText: `{
                    "schemaVersion": "2.2",
                    "mainSteps": [],
                    "parameters": {

                    }
                }`,
                        position: [4, 9],
                        textEdits: [],
                    })
                }))
            test('Should not suggest existing parameters', () =>
                __awaiter(void 0, void 0, void 0, function*() {
                    yield testPropertyCompletion({
                        ext: 'json',
                        labels: [],
                        docText: `{
                    "schemaVersion": "2.2",
                    "mainSteps": [
                        {
                            "action": "aws:applications",
                            "name": "exampleApplications",
                            "inputs": {
                                "action": "Install",
                                "source": "{{ source }}"
                            }
                        }
                    ],
                    "parameters": {
                        "s": {
                            "type": "String",
                            "description": "(Required) Description for this parameter.",
                            "default": "default value",
                            "allowedValues": ["value1", "value2"],
                            "allowedPattern": "[a-zA-Z]",
                            "minChars": 0
                        },
                        "source": {
                            "type": "String",
                            "description": "(Required) Description for this parameter.",
                            "default": "default value",
                            "allowedValues": ["value1", "value2"],
                            "allowedPattern": "[a-zA-Z]",
                            "minChars": 0
                        }
                    }
                }`,
                        position: [13, 10],
                        textEdits: [],
                    })
                }))
            test('Suggest parameters', () =>
                __awaiter(void 0, void 0, void 0, function*() {
                    yield testPropertyCompletion({
                        ext: 'json',
                        labels: ['"source"', '"sourceHash"'],
                        docText: `{
                    "schemaVersion": "2.2",
                    "parameters": {
                        s:
                    },
                    "mainSteps": [
                        {
                            "action": "aws:applications",
                            "name": "exampleApplications",
                            "inputs": {
                                "action": "Install",
                                "source": "{{ source }}",
                                "sourceHash": "{{ sourceHash }}"
                            }
                        }
                    ]
                }`,
                        position: [3, 9],
                        textEdits: [
                            {
                                newText: '"source"',
                                range: vscode_json_languageservice_1.Range.create(
                                    {
                                        line: 2,
                                        character: 20,
                                    },
                                    {
                                        line: 2,
                                        character: 32,
                                    }
                                ),
                            },
                            {
                                newText: '"sourceHash"',
                                range: vscode_json_languageservice_1.Range.create(
                                    {
                                        line: 2,
                                        character: 20,
                                    },
                                    {
                                        line: 2,
                                        character: 32,
                                    }
                                ),
                            },
                        ],
                    })
                }))
        })
    )
    suite('YAML', () =>
        __awaiter(void 0, void 0, void 0, function*() {
            test('No variable parameters', () =>
                __awaiter(void 0, void 0, void 0, function*() {
                    yield testPropertyCompletion({
                        ext: 'yaml',
                        labels: [],
                        docText: `---
schemaVersion: '2.2'
description: Example document description
parameters:
  e:
    type: String
    description: Example parameter
    default: Hello World
mainSteps:
  - action: example action
    name: example
    inputs:
      example input:
        - 'example'
`,
                        position: [4, 3],
                        textEdits: [],
                    })
                }))
            test('Should not suggest existing parameters', () =>
                __awaiter(void 0, void 0, void 0, function*() {
                    yield testPropertyCompletion({
                        ext: 'yaml',
                        labels: [],
                        docText: `---
schemaVersion: '2.2'
description: Example document description
parameters:
  example:
    type: String
    description: Example parameter
    default: Hello World
  e:
    type: String
    description: (Required) Description for this parameter.
    default: default value
    allowedPattern: [a-zA-Z]
    allowedValues:
      - value1
      - value2
    minChars: 0
mainSteps:
  - action: example action
    name: example
    inputs:
      example input:
        - '{{example}}'`,
                        position: [8, 3],
                        textEdits: [],
                    })
                }))
            test('suggest parameters', () =>
                __awaiter(void 0, void 0, void 0, function*() {
                    yield testPropertyCompletion({
                        ext: 'yaml',
                        labels: ['sourceHash'],
                        docText: `---
schemaVersion: "2.2"
description: "Example document description"
parameters:
  source:
    type: Boolean
    description: (Required) Description for this parameter.
    default: true
  s
mainSteps:
- action: "aws:applications"
  name: "exampleApplications"
  inputs:
    action: "Install"
    source: "{{ source }}"
    sourceHash: "{{ sourceHash }}"`,
                        position: [8, 3],
                        insertTexts: ['sourceHash'],
                    })
                }))
        })
    )
})
suite('Test Parameter Snippet Completion', () =>
    __awaiter(void 0, void 0, void 0, function*() {
        test('json', () =>
            __awaiter(void 0, void 0, void 0, function*() {
                yield testParameterSnippetCompletesion({
                    ext: 'json',
                    labels: parameterObject_json_1.default.definitions.additionalProperties.defaultSnippets.map(
                        item => {
                            return item.label
                        }
                    ),
                    docText: `{
                "schemaVersion": "2.2",
                "parameters": {
                    "source": {
                        p
                    }
                },
                "mainSteps": [
                    {
                        "action": "aws:applications",
                        "name": "exampleApplications",
                        "inputs": {
                            "action": "Install",
                            "source": "{{ source }}"
                        }
                    }
                ]
            }`,
                    position: [4, 13],
                    insertTexts: [],
                })
            }))
        test('yaml', () =>
            __awaiter(void 0, void 0, void 0, function*() {
                yield testParameterSnippetCompletesion({
                    ext: 'yaml',
                    labels: parameterObject_json_1.default.definitions.additionalProperties.defaultSnippets.map(
                        item => {
                            return item.label
                        }
                    ),
                    docText: `---
schemaVersion: "2.2"
description: "Example document description"
parameters:
  source:
    p
mainSteps:
- action: "aws:applications"
  name: "exampleApplications"
  inputs:
    action: "Install"
    source: "{{ source }}"`,
                    position: [5, 5],
                    insertTexts: [],
                })
            }))
    })
)
suite('Test Action Snippet Completion', () => {
    suite('JSON', () => {
        test('Command 2.2 Document', () =>
            __awaiter(void 0, void 0, void 0, function*() {
                yield testActionSnippetCompletion({
                    ext: 'json',
                    labels: commandSnippets_json_1.default.definitions['2.2'].defaultSnippets.map(item => {
                        return item.label
                    }),
                    docText: `{
                    "schemaVersion": "2.2",
                    "mainSteps": [
                        a
                    ]
                }`,
                    position: [3, 9],
                    insertTexts: commandSnippets_json_1.default.definitions['2.2'].defaultSnippets.map(item => {
                        return JSON.stringify(item.body, undefined, '\t') + ','
                    }),
                })
            }))
        test('Automation Document', () =>
            __awaiter(void 0, void 0, void 0, function*() {
                yield testActionSnippetCompletion(
                    {
                        ext: 'json',
                        labels: automationSnippets_json_1.default.definitions['0.3'].defaultSnippets.map(item => {
                            return item.label
                        }),
                        docText: `{
                    "schemaVersion": "0.3",
                    "mainSteps": [
                        a
                    ]
                }`,
                        position: [3, 9],
                        insertTexts: automationSnippets_json_1.default.definitions['0.3'].defaultSnippets.map(item => {
                            return JSON.stringify(item.body, undefined, '\t') + ','
                        }),
                    },
                    'automation'
                )
                yield testActionSnippetCompletion(
                    {
                        ext: 'json',
                        labels: [],
                        docText: `{
                    "schemaVersion": "0.3",
                    "mainSteps": [
                        {
                            a
                        }
                    ]
                }`,
                        position: [4, 12],
                        insertTexts: [],
                    },
                    'automation'
                )
            }))
    })
    suite('YAML', () => {
        test('Command 2.2 Document', () =>
            __awaiter(void 0, void 0, void 0, function*() {
                yield testActionSnippetCompletion({
                    ext: 'yaml',
                    labels: commandSnippets_json_1.default.definitions['2.2'].defaultSnippets.map(item => {
                        return item.label
                    }),
                    docText: `---
schemaVersion: '2.2'
mainSteps:
-
  a
assumeRole: test`,
                    position: [4, 3],
                    insertTexts: commandSnippets_json_1.default.definitions['2.2'].defaultSnippets.map(item => {
                        return YAML.stringify(item.body)
                    }),
                })
            }))
        test('Automation Document', () =>
            __awaiter(void 0, void 0, void 0, function*() {
                yield testActionSnippetCompletion(
                    {
                        ext: 'yaml',
                        labels: automationSnippets_json_1.default.definitions['0.3'].defaultSnippets.map(item => {
                            return item.label
                        }),
                        docText: `---
schemaVersion: '0.3'
mainSteps:
-
  a
assumeRole: test`,
                        position: [4, 3],
                        insertTexts: automationSnippets_json_1.default.definitions['0.3'].defaultSnippets.map(item => {
                            return YAML.stringify(item.body)
                        }),
                    },
                    'automation'
                )
            }))
    })
})
//# sourceMappingURL=testCompletion.test.js.map
