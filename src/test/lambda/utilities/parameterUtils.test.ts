/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as path from 'path'
import * as vscode from 'vscode'
import {
    getOverriddenParameters,
    GetOverriddenParametersContext,
    getParameterNames,
    getParameters,
    GetParametersContext
} from '../../../lambda/utilities/parameterUtils'
import { getNormalizedRelativePath } from '../../../shared/utilities/pathUtils'

describe('parameterUtils', async () => {
    describe('getParameters', async () => {
        it('returns an empty map if template has no parameters section', async () => {
            const context: GetParametersContext = {
                loadTemplate: async () => ({})
            }

            const actual = await getParameters(vscode.Uri.file(''), context)
            assert.strictEqual(actual.size, 0)
        })

        it('returns an empty map if parameters section is empty', async () => {
            const context: GetParametersContext = {
                loadTemplate: async () => ({
                    Parameters: {}
                })
            }

            const actual = await getParameters(vscode.Uri.file(''), context)
            assert.strictEqual(actual.size, 0)
        })

        it('sets `required` to true if default is undefined', async () => {
            const context: GetParametersContext = {
                loadTemplate: async () => ({
                    Parameters: {
                        MyParam: {
                            Type: 'String'
                        }
                    }
                })
            }

            const actual = await getParameters(vscode.Uri.file(''), context)
            assert.strictEqual(actual.size, 1)

            const parameter = actual.get('MyParam')
            assert.ok(parameter)
            assert.strictEqual(parameter!.required, true)
        })

        it('sets `required` to false if default is defined, but falsy', async () => {
            const context: GetParametersContext = {
                loadTemplate: async () => ({
                    Parameters: {
                        MyParam: {
                            Type: 'String',
                            Default: false
                        }
                    }
                })
            }

            const actual = await getParameters(vscode.Uri.file(''), context)
            assert.strictEqual(actual.size, 1)

            const parameter = actual.get('MyParam')
            assert.ok(parameter)
            assert.strictEqual(parameter!.required, false)
        })

        it('sets `required` to false if default is defined and truthy', async () => {
            const context: GetParametersContext = {
                loadTemplate: async () => ({
                    Parameters: {
                        MyParam: {
                            Type: 'String',
                            Default: true
                        }
                    }
                })
            }

            const actual = await getParameters(vscode.Uri.file(''), context)
            assert.strictEqual(actual.size, 1)

            const parameter = actual.get('MyParam')
            assert.ok(parameter)
            assert.strictEqual(parameter!.required, false)
        })
    })

    describe('getParameterNames', async () => {
        it('returns an empty array if no parameters were found', async () => {
            const context: GetParametersContext = {
                loadTemplate: async () => ({})
            }

            const actual = await getParameterNames(vscode.Uri.file(''), context)
            assert.strictEqual(actual.length, 0)
        })

        it('returns the names of each parameter', async () => {
            const context: GetParametersContext = {
                loadTemplate: async () => ({
                    Parameters: {
                        MyParam1: {
                            Type: 'String'
                        },
                        MyParam2: {
                            Type: 'String'
                        }
                    }
                })
            }

            const actual = await getParameterNames(vscode.Uri.file(''), context)
            assert.strictEqual(actual.length, 2)
            assert.strictEqual(actual[0], 'MyParam1')
            assert.strictEqual(actual[1], 'MyParam2')
        })
    })

    describe('getOverriddenParameters', async () => {
        const workspaceFolderUri = vscode.Uri.file(path.join('my', 'workspace', 'folder'))
        const templateUri = vscode.Uri.file(path.join(workspaceFolderUri.fsPath, 'some', 'template.yaml'))
        const templateId = getNormalizedRelativePath(workspaceFolderUri.fsPath, templateUri.fsPath)

        it('throws if template is not in the workspace', async () => {
            const context: GetOverriddenParametersContext = {
                getWorkspaceFolder: uri => undefined,
                loadTemplatesConfig: async () => ({
                    templates: {}
                })
            }

            try {
                await getOverriddenParameters(templateUri, context)
            } catch (err) {
                assert.strictEqual(String(err), `Error: The template ${templateUri.fsPath} is not in the workspace`)

                return
            }

            assert.fail('expected exception, but none occurred')
        })

        it('returns undefined if no config is found for this template', async () => {
            const context: GetOverriddenParametersContext = {
                getWorkspaceFolder: () => ({
                    uri: workspaceFolderUri
                }),
                loadTemplatesConfig: async () => ({
                    templates: {}
                })
            }

            const actual = await getOverriddenParameters(templateUri, context)
            assert.strictEqual(actual, undefined)
        })

        it('returns undefined if config for this template does not contain `parameterOverrides`', async () => {
            const context: GetOverriddenParametersContext = {
                getWorkspaceFolder: () => ({
                    uri: workspaceFolderUri
                }),
                loadTemplatesConfig: async () => ({
                    templates: {
                        [templateId]: {}
                    }
                })
            }

            const actual = await getOverriddenParameters(templateUri, context)
            assert.strictEqual(actual, undefined)
        })

        it('returns an empty map if this template contains an empty `parameterOverrides`', async () => {
            const context: GetOverriddenParametersContext = {
                getWorkspaceFolder: () => ({
                    uri: vscode.Uri.file(workspaceFolderUri.fsPath)
                }),
                loadTemplatesConfig: async () => ({
                    templates: {
                        [templateId]: {
                            parameterOverrides: {}
                        }
                    }
                })
            }

            const actual = await getOverriddenParameters(templateUri, context)
            assert.ok(actual)
            assert.strictEqual(actual!.size, 0)
        })

        it('returns a map of parameter names to their overridden values', async () => {
            const context: GetOverriddenParametersContext = {
                getWorkspaceFolder: () => ({
                    uri: workspaceFolderUri
                }),
                loadTemplatesConfig: async () => ({
                    templates: {
                        [templateId]: {
                            parameterOverrides: {
                                MyParamName1: 'MyParamValue1',
                                MyParamName2: 'MyParamValue2'
                            }
                        }
                    }
                })
            }

            const actual = await getOverriddenParameters(templateUri, context)
            assert.ok(actual)
            assert.strictEqual(actual!.size, 2)
            assert.ok(actual!.has('MyParamName1'))
            assert.ok(actual!.has('MyParamName2'))
            assert.strictEqual(actual!.get('MyParamName1'), 'MyParamValue1')
            assert.strictEqual(actual!.get('MyParamName2'), 'MyParamValue2')
        })
    })
})
