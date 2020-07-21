/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT
 */

import * as assert from 'assert'

import { CompletionItemKind, Range, TextEdit } from 'vscode-json-languageservice'

import parameterObject from '../json-schema/partial/parameterObject.json'
import automationSnippets from '../json-schema/partial/snippets/automationSnippets.json'
import commandSnippets from '../json-schema/partial/snippets/commandSnippets.json'

import * as ssmSchema from '../json-schema/ssmdocschema.json'
import { getLanguageServiceSSM, JsonLS } from '../service'
import { toDocument } from './util'

import { getYAMLActionSnippetsCompletion } from '../completion/completeSnippet'

import * as YAML from 'yaml'

const s: JsonLS.JSONSchema = ssmSchema

interface TestCompletionOptions {
    ext: string
    labels: string[]
    docText: string
    position: [number, number]
    insertTexts?: string[]
    textEdits?: TextEdit[]
}

async function getCompletions(json: string, position: [number, number], ext: string, type: string) {
    const { textDoc, jsonDoc } = toDocument(json, ext, type)
    const pos = JsonLS.Position.create(...position)
    const ls = getLanguageServiceSSM({})

    return await ls.doComplete(textDoc, pos, jsonDoc)
}

async function testActionSnippetCompletion(options: TestCompletionOptions, type: string = 'command') {
    const { ext, labels, docText, position, insertTexts } = options
    const result = await getCompletions(docText, position, ext, type)
    result.items = result.items.filter(item => {
        if (item.kind === CompletionItemKind.Value) {
            return item
        }
    })

    if (ext === 'yaml') {
        console.log(result)
    }

    assert.strictEqual(result?.items.length, labels.length)
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
}

async function testParameterSnippetCompletesion(options: TestCompletionOptions, type: string = 'command') {
    const { ext, labels, docText, position, insertTexts } = options
    const result = await getCompletions(docText, position, ext, type)

    result.items = result.items.filter(item => {
        if (item.kind === CompletionItemKind.Snippet || item.kind === CompletionItemKind.Module) {
            return item
        }
    })

    assert.strictEqual(result?.items.length, labels.length)

    assert.deepStrictEqual(
        result.items.map(item => item.label),
        labels
    )
}

async function testPropertyCompletion(options: TestCompletionOptions, type: string = 'command') {
    const { ext, labels, docText, position, insertTexts, textEdits } = options
    const result = await getCompletions(docText, position, ext, type)
    result.items = result.items.filter(item => {
        if (item.kind === CompletionItemKind.Property) {
            return item
        }
    })

    assert.strictEqual(result?.items.length, labels.length)
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
}

const topLevelElements = ['runtimeConfig', 'mainSteps', 'files', 'outputs', 'description', 'assumeRole', 'parameters']

suite('Test Top Level Elements Completion', () => {
    const labels = topLevelElements.filter(item => item !== 'schemaVersion')
    suite('JSON', () => {
        test('No schemaVersion', async () => {
            await testPropertyCompletion({
                ext: 'json',
                labels: ['schemaVersion'],
                docText: `{
                    "
                }`,
                position: [1, 5],
                insertTexts: ['"schemaVersion"'],
            })
        })
        test('Valid schemaVersion', async () => {
            await testPropertyCompletion({
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
        })
    })
    suite('YAML', () => {
        test('No schemaVersion', async () => {
            await testPropertyCompletion({
                ext: 'yaml',
                labels: ['schemaVersion'],
                docText: `---
s`,
                position: [1, 1],
                insertTexts: ['schemaVersion'],
            })
        })
        test('Valid schemaVersion', async () => {
            await testPropertyCompletion({
                ext: 'yaml',
                labels: labels,
                docText: `---
schemaVersion: '2.2'
`,
                position: [2, 1],
                insertTexts: labels,
            })
        })
    })
})

suite('Test Parameter Name Completion', () => {
    suite('JSON', async () => {
        test('No variable parameters', async () => {
            await testPropertyCompletion({
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
        })
        test('Should not suggest existing parameters', async () => {
            await testPropertyCompletion({
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
        })
        test('Suggest parameters', async () => {
            await testPropertyCompletion({
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
                        range: Range.create(
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
                        range: Range.create(
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
        })
    })
    suite('YAML', async () => {
        test('No variable parameters', async () => {
            await testPropertyCompletion({
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
        })
        test('Should not suggest existing parameters', async () => {
            await testPropertyCompletion({
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
        })
        test('suggest parameters', async () => {
            await testPropertyCompletion({
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
        })
    })
})

suite('Test Parameter Snippet Completion', async () => {
    test('json', async () => {
        await testParameterSnippetCompletesion({
            ext: 'json',
            labels: parameterObject.definitions.additionalProperties.defaultSnippets.map(item => {
                return item.label
            }),
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
    })
    test('yaml', async () => {
        await testParameterSnippetCompletesion({
            ext: 'yaml',
            labels: parameterObject.definitions.additionalProperties.defaultSnippets.map(item => {
                return item.label
            }),
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
    })
})

suite('Test Action Snippet Completion', () => {
    suite('JSON', () => {
        test('Command 2.2 Document', async () => {
            await testActionSnippetCompletion({
                ext: 'json',
                labels: commandSnippets.definitions['2.2'].defaultSnippets.map(item => {
                    return item.label
                }),
                docText: `{
                    "schemaVersion": "2.2",
                    "mainSteps": [
                        a
                    ]
                }`,
                position: [3, 9],
                insertTexts: commandSnippets.definitions['2.2'].defaultSnippets.map(item => {
                    return JSON.stringify(item.body, undefined, '\t') + ','
                }),
            })
        })
        test('Automation Document', async () => {
            await testActionSnippetCompletion(
                {
                    ext: 'json',
                    labels: automationSnippets.definitions['0.3'].defaultSnippets.map(item => {
                        return item.label
                    }),
                    docText: `{
                    "schemaVersion": "0.3",
                    "mainSteps": [
                        a
                    ]
                }`,
                    position: [3, 9],
                    insertTexts: automationSnippets.definitions['0.3'].defaultSnippets.map(item => {
                        return JSON.stringify(item.body, undefined, '\t') + ','
                    }),
                },
                'automation'
            )
            await testActionSnippetCompletion(
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
        })
    })
    suite('YAML', () => {
        test('Command 2.2 Document', async () => {
            await testActionSnippetCompletion({
                ext: 'yaml',
                labels: commandSnippets.definitions['2.2'].defaultSnippets.map(item => {
                    return item.label
                }),
                docText: `---
schemaVersion: '2.2'
mainSteps:
-
  a
assumeRole: test`,
                position: [4, 3],
                insertTexts: commandSnippets.definitions['2.2'].defaultSnippets.map(item => {
                    return YAML.stringify(item.body)
                }),
            })
        })
        test('Automation Document', async () => {
            await testActionSnippetCompletion(
                {
                    ext: 'yaml',
                    labels: automationSnippets.definitions['0.3'].defaultSnippets.map(item => {
                        return item.label
                    }),
                    docText: `---
schemaVersion: '0.3'
mainSteps:
-
  a
assumeRole: test`,
                    position: [4, 3],
                    insertTexts: automationSnippets.definitions['0.3'].defaultSnippets.map(item => {
                        return YAML.stringify(item.body)
                    }),
                },
                'automation'
            )
        })
    })
})
