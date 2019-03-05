/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import * as path from 'path'
import * as vscode from 'vscode'
import { detectLocalTemplates } from '../../../lambda/local/detectLocalTemplates'
import {
    SamDeployWizard,
    SamDeployWizardContext
} from '../../../lambda/wizards/samDeployWizard'

interface QuickPickResponseItem extends vscode.QuickPickItem {
    uri: vscode.Uri
}

function createQuickPickResponseItem(uri: vscode.Uri): QuickPickResponseItem {
    return {
        label: '',
        uri: uri,
    }
}

class MockSamDeployWizardContext implements SamDeployWizardContext {
    public get workspaceFolders(): vscode.Uri[] | undefined {
        if (this.workspaceFoldersResponses.length <= 0) {
            throw new Error('workspaceFolders was called more times than expected')
        }

        return this.workspaceFoldersResponses.pop()
    }

    public constructor(
        public readonly onDetectLocalTemplates: typeof detectLocalTemplates,
        private readonly workspaceFoldersResponses: (vscode.Uri[] | undefined)[] = [],
        private readonly showInputBoxReponses: (string | undefined)[] = [],
        private readonly promptForSamTemplateResponses: (QuickPickResponseItem | undefined)[] = [],
        private readonly promptForS3BucketResponses: (string | undefined)[] = []
    ) {
        this.workspaceFoldersResponses = workspaceFoldersResponses.reverse()
        this.showInputBoxReponses = showInputBoxReponses.reverse()
        this.promptForSamTemplateResponses = promptForSamTemplateResponses.reverse()
        this.promptForS3BucketResponses = promptForS3BucketResponses.reverse()
    }

    public async showInputBox(
        options?: vscode.InputBoxOptions,
        token?: vscode.CancellationToken
    ): Promise<string | undefined> {
        if (this.showInputBoxReponses.length <= 0) {
            throw new Error('showInputBox was called more times than expected')
        }

        const response = this.showInputBoxReponses.pop()

        if (response && options && options.validateInput) {
            const validationResult = options.validateInput(response)
            if (validationResult) {
                throw new Error(`Validation error: ${validationResult}`)
            }
        }

        return response
    }

    public async promptUserForSamTemplate(): Promise<vscode.Uri | undefined> {
        if (this.promptForSamTemplateResponses.length <= 0) {
            throw new Error('promptUserForSamTemplate was called more times than expected')
        }

        const response = this.promptForSamTemplateResponses.pop()
        if (!response) { return undefined }

        return response.uri
    }

    public async promptUserForS3Bucket(initialValue?: string): Promise<string | undefined> {
        if (this.promptForS3BucketResponses.length <= 0) {
            throw new Error('promptUserForS3Bucket was called more times than expected')
        }

        return this.promptForS3BucketResponses.pop()
    }
}

function normalizePath(...paths: string[]): string {
    return vscode.Uri.file(path.join(...paths)).fsPath
}

describe('SamDeployWizard', async () => {
    describe('TEMPLATE', async () => {
        it('fails gracefully when no templates are found', async () => {
            const wizard = new SamDeployWizard(new MockSamDeployWizardContext(
                async function*() { yield* [] },
                [[]],
                [],
                [undefined],
                [],
            ))
            const result = await wizard.run()

            assert.ok(!result)
        })

        it('exits wizard when cancelled', async () => {
            const workspaceFolderPath = normalizePath('my', 'workspace', 'folder')
            const templatePath = normalizePath(workspaceFolderPath, 'template.yaml')
            const wizard = new SamDeployWizard(new MockSamDeployWizardContext(
                async function*() { yield vscode.Uri.file(templatePath) },
                [[vscode.Uri.file(workspaceFolderPath)]],
                [],
                [undefined],
                [],
            ))
            const result = await wizard.run()

            assert.ok(!result)
        })

        it('uses user response as template', async () => {
            const workspaceFolderPath = normalizePath('my', 'workspace', 'folder')
            const templatePath = normalizePath(workspaceFolderPath, 'template.yaml')
            const wizard = new SamDeployWizard(new MockSamDeployWizardContext(
                async function*() { yield vscode.Uri.file(templatePath) },
                [[vscode.Uri.file(workspaceFolderPath)]],
                ['myStackName'],
                [
                    createQuickPickResponseItem(vscode.Uri.file(templatePath))
                ],
                ['mys3bucketname'],
            ))
            const result = await wizard.run()

            assert.ok(result)
            assert.strictEqual(result!.template.fsPath, templatePath)
        })
    })

    describe('S3_BUCKET', async () => {
        it('goes back when cancelled', async () => {
            const workspaceFolderPath1 = normalizePath('my', 'workspace', 'folder', '1')
            const workspaceFolderPath2 = normalizePath('my', 'workspace', 'folder', '2')
            const templatePath1 = normalizePath(workspaceFolderPath1, 'template.yaml')
            const templatePath2 = normalizePath(workspaceFolderPath2, 'template.yaml')

            const wizard = new SamDeployWizard(new MockSamDeployWizardContext(
                async function*() {
                    yield vscode.Uri.file(templatePath1)
                    yield vscode.Uri.file(templatePath2)
                },
                [
                    [vscode.Uri.file(workspaceFolderPath1)],
                    [vscode.Uri.file(workspaceFolderPath2)]
                ],
                [
                    'myStackName'
                ],
                [
                    createQuickPickResponseItem(vscode.Uri.file(templatePath1)),
                    createQuickPickResponseItem(vscode.Uri.file(templatePath2)),
                ],
                [
                    undefined, // First time we ask about the S3 Bucket, cancel back to the template step
                    'mys3bucketname'
                ]
            ))
            const result = await wizard.run()

            assert.ok(result)
            assert.strictEqual(result!.template.fsPath, templatePath2)
        })

        it('uses user response as s3Bucket', async () => {
            const workspaceFolderPath = normalizePath('my', 'workspace', 'folder')
            const templatePath = normalizePath(workspaceFolderPath, 'template.yaml')
            const wizard = new SamDeployWizard(new MockSamDeployWizardContext(
                async function*() { yield vscode.Uri.file(templatePath) },
                [[vscode.Uri.file(workspaceFolderPath)]],
                [
                    'myStackName'
                ],
                [
                    createQuickPickResponseItem(vscode.Uri.file(templatePath)),
                ],
                ['mys3bucketname'],
            ))
            const result = await wizard.run()

            assert.ok(result)
            assert.strictEqual(result!.s3Bucket, 'mys3bucketname')
        })

        // In product code, failed validation will prevent the user from submitting the invalid reponse
        // In test code, failed validation throws an exception instead.
        describe('validation', async () => {
            async function assertValidationFails(bucketName: string | undefined): Promise<void> {
                const workspaceFolderPath = normalizePath('my', 'workspace', 'folder')
                const templatePath = normalizePath(workspaceFolderPath, 'template.yaml')

                try {
                    await new SamDeployWizard(new MockSamDeployWizardContext(
                        async function*() { yield vscode.Uri.file(templatePath) },
                        [[vscode.Uri.file(workspaceFolderPath)]],
                        [],
                        [
                            createQuickPickResponseItem(vscode.Uri.file(templatePath)),
                        ],
                        [bucketName],
                    )).run()
                } catch (err) {
                    return
                }

                assert.fail(`Expected validation for bucket name '${bucketName}' to fail, but it passed.`)
            }

            it('validates that bucket name has a valid length', async () => {
                await assertValidationFails('aa')
                await assertValidationFails('aaaaaaaabbbbbbbbccccccccddddddddeeeeeeeeffffffffgggggggghhhhhhhh')
            })

            it('validates that bucket name does not contain invalid characters', async () => {
                await assertValidationFails('aaA')
                await assertValidationFails('aa_')
                await assertValidationFails('aa$')
            })

            it('validates that bucket name is not formatted as an ip address', async () => {
                await assertValidationFails('198.51.100.24')
            })

            it('validates that bucket name does not end with a dash', async () => {
                await assertValidationFails('aa-')
            })

            it('validates that bucket name does not contain consecutive periods', async () => {
                await assertValidationFails('a..a')
            })

            it('validates that bucket name does not contain a period adjacent to a dash', async () => {
                await assertValidationFails('a.-a')
                await assertValidationFails('a-.a')
            })

            it('validates that each label in bucket name begins with a number or a lower-case character', async () => {
                await assertValidationFails('Aaa')
                await assertValidationFails('aaa.Bbb')
            })
        })
    })

    describe('STACK_NAME', async () => {
        it('goes back when cancelled', async () => {
            const workspaceFolderPath = normalizePath('my', 'workspace', 'folder')
            const templatePath = normalizePath(workspaceFolderPath, 'template.yaml')
            const wizard = new SamDeployWizard(new MockSamDeployWizardContext(
                async function*() { yield vscode.Uri.file(templatePath) },
                [[vscode.Uri.file(workspaceFolderPath)]],
                [
                    undefined,
                    'myStackName'
                ],
                [
                    createQuickPickResponseItem(vscode.Uri.file(templatePath)),
                ],
                [
                    'mys3bucketname1',
                    'mys3bucketname2',
                ],
            ))
            const result = await wizard.run()

            assert.ok(result)
            assert.strictEqual(result!.s3Bucket, 'mys3bucketname2')
        })

        it('uses user response as stackName', async () => {
            const workspaceFolderPath = normalizePath('my', 'workspace', 'folder')
            const templatePath = normalizePath(workspaceFolderPath, 'template.yaml')
            const wizard = new SamDeployWizard(new MockSamDeployWizardContext(
                async function*() { yield vscode.Uri.file(templatePath) },
                [[vscode.Uri.file(workspaceFolderPath)]],
                [
                    'myStackName'
                ],
                [
                    createQuickPickResponseItem(vscode.Uri.file(templatePath)),
                ],
                [
                    'mys3bucketname',
                ],
            ))
            const result = await wizard.run()

            assert.ok(result)
            assert.strictEqual(result!.stackName, 'myStackName')
        })

        describe('validation', async () => {
            async function assertValidationFails(stackName: string | undefined): Promise<void> {
                const workspaceFolderPath = normalizePath('my', 'workspace', 'folder')
                const templatePath = normalizePath(workspaceFolderPath, 'template.yaml')

                try {
                    await new SamDeployWizard(new MockSamDeployWizardContext(
                        async function*() { yield vscode.Uri.file(templatePath) },
                        [[vscode.Uri.file(workspaceFolderPath)]],
                        [stackName],
                        [
                            createQuickPickResponseItem(vscode.Uri.file(templatePath)),
                        ],
                        ['myBucketName'],
                    )).run()
                } catch (err) {
                    return
                }

                assert.fail(`Expected validation for stack name '${stackName}' to fail, but it passed.`)
            }

            it('validates that stackName does not contain invalid charcters', async () => {
                await assertValidationFails('ab_c')
                await assertValidationFails('ab$c')
                await assertValidationFails('ab.c')
            })

            it('validates that stackName begins with an alphabetic character', async () => {
                await assertValidationFails('1abc')
                await assertValidationFails('-abc')
            })

            it('validates that stackName is not longer than 128 characters', async () => {
                const parts = []
                for (let i = 0; i < 129; i++) {
                    parts.push('a')
                }

                await assertValidationFails(parts.join(''))
            })
        })
    })
})
