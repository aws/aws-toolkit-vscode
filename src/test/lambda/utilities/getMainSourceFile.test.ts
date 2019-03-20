/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import '../../../shared/utilities/asyncIteratorShim'

import * as assert from 'assert'
import * as os from 'os'
import * as path from 'path'
import * as vscode from 'vscode'
import { getMainSourceFileUri } from '../../../lambda/utilities/getMainSourceFile'
import { CloudFormation } from '../../../shared/cloudformation/cloudformation'

async function* toAsyncIterable<T>(array: T[]): AsyncIterable<T> {
    yield *array
}

describe('getMainSourceFile', async () => {
    it('throws when no template is found', async () => {
        const root = vscode.Uri.file('/dir')
        try {
            await getMainSourceFileUri({
                root,
                getLocalTemplates: (...workspaceUris: vscode.Uri[]) => toAsyncIterable([]),
            })
        } catch (err) {
            assert.strictEqual(
                String(err),
                `Error: Invalid project format: '${root.fsPath}' does not contain a SAM template.`
            )

            return
        }

        assert.fail('Expected an exception, but none was thrown.')
    })

    it('throws when template is empty', async () => {
        const templateUri = vscode.Uri.file(path.join('/dir', 'template.yaml'))
        try {
            await getMainSourceFileUri({
                root: vscode.Uri.file('/dir'),
                getLocalTemplates: (...workspaceUris: vscode.Uri[]) => toAsyncIterable([templateUri]),
                loadSamTemplate: async uri => ({}),
                fileExists: async p => ['.ts'].indexOf(path.extname(p)) >= 0
            })
        } catch (err) {
            assert.strictEqual(
                String(err),
                `Error: SAM Template '${templateUri.fsPath}' does not contain any resources`
            )

            return
        }

        assert.fail('Expected an exception, but none was thrown.')
    })

    it('throws when template only contains non-lambda resources', async () => {
        const templateUri = vscode.Uri.file(path.join('/dir', 'template.yaml'))
        try {
            await getMainSourceFileUri({
                root: vscode.Uri.file('/dir'),
                getLocalTemplates: (...workspaceUris: vscode.Uri[]) => toAsyncIterable([templateUri]),
                loadSamTemplate: async uri =>  ({
                    Resources: {
                        HelloWorld: {
                            Type: 'AWS::Serverless:NotAFunction'
                        } as any as CloudFormation.Resource
                    }
                }),
                fileExists: async p => ['.ts'].indexOf(path.extname(p)) >= 0
            })
        } catch (err) {
            assert.strictEqual(
                String(err),
                `Error: SAM Template '${templateUri.fsPath}' does not contain any lambda resources`
            )

            return
        }

        assert.fail('Expected an exception, but none was thrown.')
    })

    it('throws when lambda resource has no properties', async () => {
        const templateUri = vscode.Uri.file(path.join('/dir', 'template.yaml'))
        try {
            await getMainSourceFileUri({
                root: vscode.Uri.file('/dir'),
                getLocalTemplates: (...workspaceUris: vscode.Uri[]) => toAsyncIterable([templateUri]),
                loadSamTemplate: async uri => ({
                    Resources: {
                        HelloWorld: {
                            Type: 'AWS::Serverless::Function'
                        }
                    }
                })
            })
        } catch (err) {
            assert.strictEqual(
                String(err),
                // JSON.stringify always uses `\n` regardless of os.EOL.
                // tslint:disable-next-line:prefer-template
                `Error: Lambda resource is missing the 'Properties' property:${os.EOL}` +
                '{\n' +
                '    "Type": "AWS::Serverless::Function"\n' +
                '}'
            )

            return
        }

        assert.fail('Expected an exception, but none was thrown.')
    })

    it('throws when runtime is unknown or unsupported', async () => {
        async function test(runtime: string | undefined, message: string): Promise<void> {
            const templateUri = vscode.Uri.file(path.join('/dir', 'template.yaml'))
            try {
                await getMainSourceFileUri({
                    root: vscode.Uri.file('/dir'),
                    getLocalTemplates: (...workspaceUris: vscode.Uri[]) => toAsyncIterable([templateUri]),
                    loadSamTemplate: async uri => ({
                        Resources: {
                            HelloWorld: {
                                Type: 'AWS::Serverless::Function',
                                Properties: {
                                    Handler: '',
                                    CodeUri: '',
                                    Runtime: runtime,
                                }
                            }
                        }
                    })
                })
            } catch (err) {
                assert.strictEqual(String(err), message)

                return
            }

            assert.fail('Expected an exception, but none was thrown.')
        }

        await test(undefined, 'Error: Unrecognized runtime: \'undefined\'')
        await test('fakeruntime', 'Error: Unrecognized runtime: \'fakeruntime\'')
        await test('go', 'Error: Lambda resource \'\' has unknown runtime \'go\'')
    })

    describe('nodejs', async () => {
        function createTestTemplate(): CloudFormation.Template {
            return {
                Resources: {
                    HelloWorld: {
                        Type: 'AWS::Serverless::Function',
                        Properties: {
                            Handler: 'app.handler',
                            CodeUri: 'my_app',
                            Runtime: 'nodejs'
                        }
                    }
                }
            }
        }

        it('returns the URI of the main source file for a valid template', async () => {
            const actual: vscode.Uri = await getMainSourceFileUri({
                root: vscode.Uri.file('/dir'),
                getLocalTemplates: (...workspaceUris: vscode.Uri[]) => toAsyncIterable([
                    vscode.Uri.file('/dir/template.yaml')
                ]),
                loadSamTemplate: async uri => createTestTemplate(),
                fileExists: async p => ['.ts'].indexOf(path.extname(p)) >= 0
            })

            assert.strictEqual(actual.fsPath, path.join(path.sep, 'dir', 'my_app', 'app.ts'))
        })

        it('recognizes all NodeJS runtimes', async () => {
            async function test(runtime?: string): Promise<void> {
                const templateUri = vscode.Uri.file(path.join('/dir', 'template.yaml'))
                const actual: vscode.Uri = await getMainSourceFileUri({
                    root: vscode.Uri.file('/dir'),
                    getLocalTemplates: (...workspaceUris: vscode.Uri[]) => toAsyncIterable([templateUri]),
                    loadSamTemplate: async uri => {
                        const template = createTestTemplate()
                        template.Resources!.HelloWorld!.Properties!.Runtime = runtime

                        return template
                    },
                    fileExists: async p => ['.ts'].indexOf(path.extname(p)) >= 0
                })

                assert.strictEqual(actual.fsPath, path.join('/dir', 'my_app', 'app.ts'))
            }

            await test('nodejs')
            await test('nodejs4.3')
            await test('nodejs6.10')
            await test('nodejs8.10')
        })

        it('prefers TypeScript files over javascript files', async () => {
            const actual: vscode.Uri = await getMainSourceFileUri({
                root: vscode.Uri.file('/dir'),
                getLocalTemplates: (...workspaceUris: vscode.Uri[]) => toAsyncIterable([
                    vscode.Uri.file('/dir/template.yaml')
                ]),
                loadSamTemplate: async uri => createTestTemplate(),
                fileExists: async p => ['.ts', '.js'].indexOf(path.extname(p)) >= 0
            })

            assert.strictEqual(actual.fsPath, path.join(path.sep, 'dir', 'my_app', 'app.ts'))
        })

        it('prefers JSX files over javascript files', async () => {
            const actual: vscode.Uri = await getMainSourceFileUri({
                root: vscode.Uri.file('/dir'),
                getLocalTemplates: (...workspaceUris: vscode.Uri[]) => toAsyncIterable([
                    vscode.Uri.file('/dir/template.yaml')
                ]),
                loadSamTemplate: async uri => createTestTemplate(),
                fileExists: async p => ['.jsx', '.js'].indexOf(path.extname(p)) >= 0
            })

            assert.strictEqual(actual.fsPath, path.join(path.sep, 'dir', 'my_app', 'app.jsx'))
        })

        it('finds javascript file if no TS or JSX file exists', async () => {
            const actual: vscode.Uri = await getMainSourceFileUri({
                root: vscode.Uri.file('/dir'),
                getLocalTemplates: (...workspaceUris: vscode.Uri[]) => toAsyncIterable([
                    vscode.Uri.file('/dir/template.yaml')
                ]),
                loadSamTemplate: async uri => createTestTemplate(),
                fileExists: async p => ['.js'].indexOf(path.extname(p)) >= 0
            })

            assert.strictEqual(actual.fsPath, path.join(path.sep, 'dir', 'my_app', 'app.js'))
        })

        it('fails when no source file is found at the expected location', async () => {
            try {
                await getMainSourceFileUri({
                    root: vscode.Uri.file('/dir'),
                    getLocalTemplates: (...workspaceUris: vscode.Uri[]) => toAsyncIterable([
                        vscode.Uri.file('/dir/template.yaml')
                    ]),
                    loadSamTemplate: async uri => createTestTemplate(),
                    fileExists: async p => false
                })
            } catch (err) {
                const expectedBasePath = path.join('/dir', 'my_app', 'app')
                assert.strictEqual(
                    String(err),
                    `Error: Javascript file expected at ${expectedBasePath}.(ts|jsx|js), but no file was found`
                )

                return
            }

            assert.fail('Expected an exception, but none was thrown.')
        })
    })

    describe('python', async () => {
        function createTestTemplate(): CloudFormation.Template {
            return {
                Resources: {
                    HelloWorld: {
                        Type: 'AWS::Serverless::Function',
                        Properties: {
                            Handler: 'app.handler',
                            CodeUri: 'my_app',
                            Runtime: 'python'
                        }
                    }
                }
            }
        }

        it('returns the URI of the main source file for a valid template', async () => {
            const actual: vscode.Uri = await getMainSourceFileUri({
                root: vscode.Uri.file('/dir'),
                getLocalTemplates: (...workspaceUris: vscode.Uri[]) => toAsyncIterable([
                    vscode.Uri.file('/dir/template.yaml')
                ]),
                loadSamTemplate: async uri => createTestTemplate(),
                fileExists: async p => path.extname(p) === '.py'
            })

            assert.strictEqual(actual.fsPath, path.join(path.sep, 'dir', 'my_app', 'app.py'))
        })

        it('recognizes all Python runtimes', async () => {
            async function test(runtime?: string): Promise<void> {
                const templateUri = vscode.Uri.file(path.join('/dir', 'template.yaml'))
                const actual: vscode.Uri = await getMainSourceFileUri({
                    root: vscode.Uri.file('/dir'),
                    getLocalTemplates: (...workspaceUris: vscode.Uri[]) => toAsyncIterable([templateUri]),
                    loadSamTemplate: async uri => {
                        const template = createTestTemplate()
                        template.Resources!.HelloWorld!.Properties!.Runtime = runtime

                        return template
                    },
                    fileExists: async p => path.extname(p) === '.py'
                })

                assert.strictEqual(actual.fsPath, path.join('/dir', 'my_app', 'app.py'))
            }

            await test('python')
            await test('python2.7')
            await test('python3.6')
       })

        it('fails when no source file is found at the expected location', async () => {
            try {
                await getMainSourceFileUri({
                    root: vscode.Uri.file('/dir'),
                    getLocalTemplates: (...workspaceUris: vscode.Uri[]) => toAsyncIterable([
                        vscode.Uri.file('/dir/template.yaml')
                    ]),
                    loadSamTemplate: async uri => createTestTemplate(),
                    fileExists: async p => false
                })
            } catch (err) {
                const expectedBasePath = path.join('/dir', 'my_app', 'app')
                assert.strictEqual(
                    String(err),
                    `Error: Python file expected at ${expectedBasePath}.py, but no file was found`
                )

                return
            }

            assert.fail('Expected an exception, but none was thrown.')
        })
    })
})
