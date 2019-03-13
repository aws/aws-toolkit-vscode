/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import * as path from 'path'
import * as vscode from 'vscode'
import { load, LoadTemplatesConfigContext } from '../../../lambda/config/templates'

describe('templates', async () => {
    describe('load', async () => {
        it('loads a valid file without parameter overrides', async () => {
            const rawJson = `{
                "templates": {
                    "relative/path/to/template.yaml": {
                    }
                }
            }`

            const context: LoadTemplatesConfigContext = {
                logger: { warn(...message: (Error | string)[]) {} },
                readFile: async pathLike => rawJson
            }

            const config = await load('', context)

            assert.ok(config)
            assert.ok(config.templates)
            assert.strictEqual(Object.getOwnPropertyNames(config.templates).length, 1)

            const template = config.templates['relative/path/to/template.yaml']
            assert.ok(template)
            assert.strictEqual(Object.getOwnPropertyNames(template).length, 0)
        })

        it('loads a valid file with parameter overrides', async () => {
            const rawJson = `{
                "templates": {
                    "relative/path/to/template.yaml": {
                        "parameterOverrides": {
                            "myParam1": "myValue1",
                            "myParam2": "myValue2",
                        }
                    }
                }
            }`

            const context: LoadTemplatesConfigContext = {
                logger: { warn(...message: (Error | string)[]) {} },
                readFile: async pathLike => rawJson
            }

            const config = await load('', context)

            assert.ok(config)
            assert.ok(config.templates)
            assert.strictEqual(Object.getOwnPropertyNames(config.templates).length, 1)

            const template = config.templates['relative/path/to/template.yaml']
            assert.ok(template)
            assert.strictEqual(Object.getOwnPropertyNames(template).length, 1)

            const parameterOverrides = template.parameterOverrides
            assert.ok(parameterOverrides)
            assert.strictEqual(Object.getOwnPropertyNames(parameterOverrides).length, 2)

            const myParam1 = Object.getOwnPropertyDescriptor(parameterOverrides, 'myParam1')
            const myParam2 = Object.getOwnPropertyDescriptor(parameterOverrides, 'myParam2')
            assert.ok(myParam1)
            assert.ok(myParam2)
            assert.strictEqual(myParam1!.value, 'myValue1')
            assert.strictEqual(myParam2!.value, 'myValue2')
        })

        it('logs a message on error loading file', async () => {
            let warnCount: number = 0
            const context: LoadTemplatesConfigContext = {
                logger: {
                    warn(...message: (Error | string)[]) {
                        assert.strictEqual(message.length, 1)
                        assert.strictEqual(message[0], 'Could not load .aws/templates.json: Error: oh no')
                        warnCount++
                    }
                },
                readFile: async pathLike => { throw new Error('oh no') }
            }

            await load('', context)

            assert.strictEqual(warnCount, 1)
        })

        it('returns a minimal config on error loading file', async () => {
            const context: LoadTemplatesConfigContext = {
                logger: { warn(...message: (Error | string)[]) {} },
                readFile: async pathLike => { throw new Error('oh no') }
            }

            const config = await load('', context)

            assert.ok(config)
            assert.ok(config.templates)
            assert.strictEqual(Object.getOwnPropertyNames(config.templates).length, 0)
        })

        it('gracefully handles invalid JSON', async () => {
            let warnCount: number = 0
            const context: LoadTemplatesConfigContext = {
                logger: {
                    warn(...message: (Error | string)[]) {
                        assert.strictEqual(message.length, 1)
                        assert.strictEqual(
                            message[0],
                            // tslint:disable-next-line:max-line-length
                            'Could not load .aws/templates.json: Error: Could not parse .aws/templates.json: close brace expected at offset 1, length 0'
                        )
                        warnCount++
                    }
                },
                readFile: async pathLike => '{'
            }

            await load('', context)

            assert.strictEqual(warnCount, 1)
        })

        it('supports JSON comments', async () => {
            const rawJson = `{
                "templates": {
                    // A single-comment.
                    /*
                      A multi-line comment.
                    */
                    "relative/path/to/template.yaml": {
                    }
                }
            }`

            const context: LoadTemplatesConfigContext = {
                logger: { warn(...message: (Error | string)[]) {} },
                readFile: async pathLike => rawJson
            }

            const config = await load('', context)

            assert.ok(config)
            assert.ok(config.templates)
            assert.strictEqual(Object.getOwnPropertyNames(config.templates).length, 1)

            const template = config.templates['relative/path/to/template.yaml']
            assert.ok(template)
            assert.strictEqual(Object.getOwnPropertyNames(template).length, 0)
        })

        it('reads from the correct path when a workspaceFolder is provided', async () => {
            const readArgs: string[] = []
            const context: LoadTemplatesConfigContext = {
                logger: { warn(...message: (Error | string)[]) {} },
                readFile: async pathLike => {
                    readArgs.push(pathLike)

                    return '{}'
                }
            }

            await load(
                { uri: vscode.Uri.file(path.join('my', 'path')) },
                context
            )

            assert.strictEqual(readArgs.length, 1)
            assert.strictEqual(readArgs[0], path.sep + path.join('my', 'path'))
        })

        it('reads from the correct path when a uri is provided', async () => {
            const readArgs: string[] = []
            const context: LoadTemplatesConfigContext = {
                logger: { warn(...message: (Error | string)[]) {} },
                readFile: async pathLike => {
                    readArgs.push(pathLike)

                    return '{}'
                }
            }

            await load(
                vscode.Uri.file(path.join('my', 'path')),
                context
            )

            assert.strictEqual(readArgs.length, 1)
            assert.strictEqual(readArgs[0], path.sep + path.join('my', 'path'))
        })

        it('reads the correct path when a string is provided', async () => {
            const readArgs: string[] = []
            const context: LoadTemplatesConfigContext = {
                logger: { warn(...message: (Error | string)[]) {} },
                readFile: async pathLike => {
                    readArgs.push(pathLike)

                    return '{}'
                }
            }

            await load(
                path.join('my', 'path'),
                context
            )

            assert.strictEqual(readArgs.length, 1)
            assert.strictEqual(readArgs[0], path.join('my', 'path'))
        })
    })
})
