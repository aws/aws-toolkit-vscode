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
import { AWSContextCommands } from '../../../shared/awsContextCommands'

class MockAwsContextCommands implements Pick<AWSContextCommands, 'onCommandSelectRegion'> {

    public constructor(
        public onCommandSelectRegion: () => Promise<string | undefined> = async () => await 'us-west-2'
    ) {}

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
        private readonly showQuickPickResponses: (vscode.QuickPickItem | undefined)[] = []
    ) {
        this.workspaceFoldersResponses = workspaceFoldersResponses.reverse()
        this.showInputBoxReponses = showInputBoxReponses.reverse()
        this.showQuickPickResponses = showQuickPickResponses.reverse()
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

    public showQuickPick(
        items: string[] | Thenable<string[]>,
        options: vscode.QuickPickOptions & { canPickMany: true },
        token?: vscode.CancellationToken
    ): Thenable<string[] | undefined>
    public showQuickPick(
        items: string[] | Thenable<string[]>,
        options?: vscode.QuickPickOptions,
        token?: vscode.CancellationToken
    ): Thenable<string | undefined>
    public showQuickPick<T extends vscode.QuickPickItem>(
        items: T[] | Thenable<T[]>,
        options: vscode.QuickPickOptions & { canPickMany: true },
        token?: vscode.CancellationToken
    ): Thenable<T[] | undefined>
    public async showQuickPick<T extends vscode.QuickPickItem>(
        items: T[] | Thenable<T[]>,
        options?: vscode.QuickPickOptions,
        token?: vscode.CancellationToken
    ): Promise<T | undefined> {
        if (this.showQuickPickResponses.length <= 0) {
            throw new Error('showQuickPick was called more times than expected')
        }

        return this.showQuickPickResponses.pop() as (T | undefined)
    }
}

function normalizePath(...paths: string[]): string {
    return vscode.Uri.file(path.join(...paths)).fsPath
}

describe('SamDeployWizard', async () => {
    describe('TEMPLATE', async () => {
        it('fails gracefully when no templates are found', async () => {
            const wizard = new SamDeployWizard(new MockAwsContextCommands(),
                                               new MockSamDeployWizardContext(
                async function*() { yield* [] },
                [[]],
                [],
                [undefined]
            ))
            const result = await wizard.run()

            assert.ok(!result)
        })

        it('exits wizard when cancelled', async () => {
            const workspaceFolderPath = normalizePath('my', 'workspace', 'folder')
            const templatePath = normalizePath(workspaceFolderPath, 'template.yaml')
            const wizard = new SamDeployWizard(new MockAwsContextCommands(),
                                               new MockSamDeployWizardContext(
                async function*() { yield vscode.Uri.file(templatePath) },
                [[ vscode.Uri.file(workspaceFolderPath) ]],
                [],
                [undefined]
            ))
            const result = await wizard.run()

            assert.ok(!result)
        })

        it('uses user response as template', async () => {
            const workspaceFolderPath = normalizePath('my', 'workspace', 'folder')
            const templatePath = normalizePath(workspaceFolderPath, 'template.yaml')
            const wizard = new SamDeployWizard(new MockAwsContextCommands(),
                                               new MockSamDeployWizardContext(
                async function*() { yield vscode.Uri.file(templatePath) },
                [[ vscode.Uri.file(workspaceFolderPath) ]],
                [ 'mys3bucketname', 'myStackName'],
                [{ uri: vscode.Uri.file(templatePath) } as any as vscode.QuickPickItem]
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

            const wizard = new SamDeployWizard(new MockAwsContextCommands(),
                                               new MockSamDeployWizardContext(
                async function*() {
                    yield vscode.Uri.file(templatePath1)
                    yield vscode.Uri.file(templatePath2)
                },
                [
                    [ vscode.Uri.file(workspaceFolderPath1) ],
                    [ vscode.Uri.file(workspaceFolderPath2) ]
                ],
                [
                    undefined,
                    'mys3bucketname',
                    'myStackName'
                ],
                [
                    { uri: vscode.Uri.file(templatePath1) } as any as vscode.QuickPickItem,
                    { uri: vscode.Uri.file(templatePath2) } as any as vscode.QuickPickItem
                ]
            ))
            const result = await wizard.run()

            assert.ok(result)
            assert.strictEqual(result!.template.fsPath, templatePath2)
        })

        it('uses user response as s3Bucket', async () => {
            const workspaceFolderPath = normalizePath('my', 'workspace', 'folder')
            const templatePath = normalizePath(workspaceFolderPath, 'template.yaml')
            const wizard = new SamDeployWizard(new MockAwsContextCommands(),
                                               new MockSamDeployWizardContext(
                async function*() { yield vscode.Uri.file(templatePath) },
                [[ vscode.Uri.file(workspaceFolderPath) ]],
                [
                    'mys3bucketname',
                    'myStackName'
                ],
                [
                    { uri: vscode.Uri.file(templatePath) } as any as vscode.QuickPickItem
                ]
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
                    await new SamDeployWizard(new MockAwsContextCommands(),
                                              new MockSamDeployWizardContext(
                        async function*() { yield vscode.Uri.file(templatePath) },
                        [[ vscode.Uri.file(workspaceFolderPath) ]],
                        [bucketName],
                        [{ uri: vscode.Uri.file(templatePath) } as any as vscode.QuickPickItem]
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
            const wizard = new SamDeployWizard(new MockAwsContextCommands(),
                                               new MockSamDeployWizardContext(
                async function*() { yield vscode.Uri.file(templatePath) },
                [[ vscode.Uri.file(workspaceFolderPath) ]],
                [
                    'mys3bucketname1',
                    undefined,
                    'mys3bucketname2',
                    'myStackName'
                ],
                [ { uri: vscode.Uri.file(templatePath) } as any as vscode.QuickPickItem ]
            ))
            const result = await wizard.run()

            assert.ok(result)
            assert.strictEqual(result!.s3Bucket, 'mys3bucketname2')
        })

        it('uses user response as stackName', async () => {
            const workspaceFolderPath = normalizePath('my', 'workspace', 'folder')
            const templatePath = normalizePath(workspaceFolderPath, 'template.yaml')
            const wizard = new SamDeployWizard(new MockAwsContextCommands(),
                                               new MockSamDeployWizardContext(
                async function*() { yield vscode.Uri.file(templatePath) },
                [[ vscode.Uri.file(workspaceFolderPath) ]],
                [
                    'mys3bucketname',
                    'myStackName'
                ],
                [{ uri: vscode.Uri.file(templatePath) } as any as vscode.QuickPickItem]
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
                    await new SamDeployWizard(new MockAwsContextCommands(),
                                              new MockSamDeployWizardContext(
                        async function*() { yield vscode.Uri.file(templatePath) },
                        [[ vscode.Uri.file(workspaceFolderPath) ]],
                        ['myBucketName', stackName],
                        [{ uri: vscode.Uri.file(templatePath) } as any as vscode.QuickPickItem]
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
