/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import * as path from 'path'
import * as vscode from 'vscode'
import { LambdaRuntime } from '../../../lambda/models/lambdaRuntime'
import {
    CreateNewSamAppWizard,
    CreateNewSamAppWizardContext
} from '../../../lambda/wizards/samInitWizard'

function isMultiDimensionalArray(array: any[] | any[][] | undefined): boolean {
    if (!array) {
        return false
    }

    for (const item of array) {
        if (!Array.isArray(item)) {
            return true
        }
    }

    return false
}

class MockCreateNewSamAppWizardContext implements CreateNewSamAppWizardContext {
    public constructor(
        private readonly _workspaceFolders: vscode.WorkspaceFolder[] | vscode.WorkspaceFolder[][],
        private readonly _lambdaRuntimes: LambdaRuntime[] | LambdaRuntime[][],
        private readonly inputBoxResult: string | string[],
        private readonly openDialogResult: (vscode.Uri[] | undefined) | (vscode.Uri[] | undefined)[]
    ) {
        if (isMultiDimensionalArray(this._workspaceFolders)) {
            this._workspaceFolders = (_workspaceFolders as vscode.WorkspaceFolder[][]).reverse()
        }
        if (isMultiDimensionalArray(this._lambdaRuntimes)) {
            this._lambdaRuntimes = (_lambdaRuntimes as LambdaRuntime[][]).reverse()
        }
        if (Array.isArray(this.inputBoxResult)) {
            this.inputBoxResult = (inputBoxResult as string[]).reverse()
        }
        if (isMultiDimensionalArray(this.openDialogResult)) {
            this.openDialogResult = (openDialogResult as vscode.Uri[][]).reverse()
        }
    }

    public get lambdaRuntimes(): LambdaRuntime[] {
        if (isMultiDimensionalArray(this._lambdaRuntimes)) {
            if (this._lambdaRuntimes!.length <= 0) {
                throw new Error('lambdaRuntimes was called more times than expected')
            }

            return (this._lambdaRuntimes as LambdaRuntime[][]).pop() || []
        }

        return (this._lambdaRuntimes as LambdaRuntime[]) || []
    }

    public get workspaceFolders(): vscode.WorkspaceFolder[] {
        if (isMultiDimensionalArray(this._workspaceFolders)) {
            if (this._workspaceFolders!.length <= 0) {
                throw new Error('workspaceFolders was called more times than expected')
            }

            return (this._workspaceFolders as vscode.WorkspaceFolder[][]).pop() || []
        }

        return (this._workspaceFolders as vscode.WorkspaceFolder[]) || []

    }

    public async showInputBox(
        options?: vscode.InputBoxOptions | undefined,
        token?: vscode.CancellationToken | undefined
    ): Promise<string | undefined> {
        if (Array.isArray(this.inputBoxResult)) {
            if (this.inputBoxResult.length <= 0) {
                throw new Error('showInputBox was called more times than expected')
            }

            return this.inputBoxResult.pop()
        }

        return this.inputBoxResult
    }

    public async showOpenDialog(
        options: vscode.OpenDialogOptions
    ): Promise<vscode.Uri[] | undefined> {
        if (isMultiDimensionalArray(this.openDialogResult)) {
            if (this.openDialogResult!.length <= 0) {
                throw new Error('showOpenDialog was called more times than expected')
            }

            return (this.openDialogResult as vscode.Uri[][]).pop()
        }

        return this.openDialogResult as vscode.Uri[]
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
    public showQuickPick<T extends vscode.QuickPickItem>(
        items: T[] | Thenable<T[]>,
        options?: vscode.QuickPickOptions,
        token?: vscode.CancellationToken
    ): Thenable<T | undefined>
    public async showQuickPick<T extends vscode.QuickPickItem>(
        items: string[] | Thenable<string[]> | T[] | Thenable<T[]>,
        options?: vscode.QuickPickOptions,
        token?: vscode.CancellationToken
    ): Promise<string | T | string[] | T[] | undefined> {
        const resolvedItems: string[] | T[] = Array.isArray(items) ?
            items as string[] | T[] :
            await (items as (Thenable<string[]> | Thenable<T[]>))

        if (resolvedItems.length <= 0) {
            return undefined
        }

        return resolvedItems[0]
    }
}

describe('CreateNewSamAppWizard', async () => {
    describe('runtime', async () => {
        it('uses user response as runtime', async () => {
            const context: CreateNewSamAppWizardContext = new MockCreateNewSamAppWizardContext(
                [],
                ['nodejs8.10'],
                'myName',
                [vscode.Uri.file(path.join('my', 'workspace', 'folder'))]
            )
            const wizard = new CreateNewSamAppWizard(context)
            const args = await wizard.run()

            assert.ok(args)
            assert.strictEqual(args!.runtime, 'nodejs8.10')
        })

        it ('exits when cancelled', async () => {
            const context: CreateNewSamAppWizardContext = new MockCreateNewSamAppWizardContext(
                [],
                [],
                'myName',
                [vscode.Uri.file(path.join('my', 'workspace', 'folder'))]
            )
            const wizard = new CreateNewSamAppWizard(context)
            const args = await wizard.run()

            assert.ok(!args)
        })
    })

    describe('location', async () => {
        it('uses user response as location', async () => {
            const locationPath = path.join('my', 'quick', 'pick', 'result')
            const context: CreateNewSamAppWizardContext = new MockCreateNewSamAppWizardContext(
                [],
                ['nodejs8.10'],
                'myName',
                [vscode.Uri.file(locationPath)]
            )
            const wizard = new CreateNewSamAppWizard(context)
            const args = await wizard.run()

            assert.ok(args)
            assert.strictEqual(args!.location.fsPath, `${path.sep}${locationPath}`)
        })

        it('backtracks when cancelled', async () => {
            const locationPath = path.join('my', 'quick', 'pick', 'result')
            const context: CreateNewSamAppWizardContext = new MockCreateNewSamAppWizardContext(
                [],
                [['python3.6'], ['nodejs8.10']],
                'myName',
                [
                    undefined,
                    [vscode.Uri.file(locationPath)]
                ]
            )
            const wizard = new CreateNewSamAppWizard(context)
            const args = await wizard.run()

            assert.ok(args)
            assert.strictEqual(args!.runtime, 'nodejs8.10')
            assert.strictEqual(args!.location.fsPath, `${path.sep}${locationPath}`)
        })

        it('contains a \'browse\' option', async () => {
            const name = 'myInputBoxResult'
            const locationPath = path.join('my', 'quick', 'pick', 'result')

            const context: CreateNewSamAppWizardContext = new MockCreateNewSamAppWizardContext(
                [],
                ['nodejs8.10'],
                name,
                [vscode.Uri.file(locationPath)]
            )
            const wizard = new CreateNewSamAppWizard(context)
            const args = await wizard.run()

            assert.ok(args)
            assert.strictEqual(args!.location.fsPath, `${path.sep}${locationPath}`)
        })

        it('contains an option for each workspace folder', async () => {
            const workspaceFolderPaths = [
                path.join('workspace', 'folder', '1'),
                path.join('workspace', 'folder', '2')
            ]

            let index = 0
            const context: CreateNewSamAppWizardContext = new MockCreateNewSamAppWizardContext(
                workspaceFolderPaths.map(p => ({
                    uri: vscode.Uri.file(p),
                    name: path.basename(p),
                    index: index++
                })),
                ['nodejs8.10'],
                'myName',
                []
            )
            const wizard = new CreateNewSamAppWizard(context)
            const args = await wizard.run()

            assert.ok(args)
            assert.strictEqual(args!.location.fsPath, `${path.sep}${workspaceFolderPaths[0]}`)
        })
    })

    describe('name', async () => {
        it('uses user response as name', async () => {
            const context: CreateNewSamAppWizardContext = new MockCreateNewSamAppWizardContext(
                [],
                ['nodejs8.10'],
                'myName',
                [vscode.Uri.file(path.join('my', 'quick', 'pick', 'result'))]
            )
            const wizard = new CreateNewSamAppWizard(context)
            const args = await wizard.run()

            assert.ok(args)
            assert.strictEqual(args!.name, 'myName')
        })

        it('backtracks when cancelled', async () => {
            const context: CreateNewSamAppWizardContext = new MockCreateNewSamAppWizardContext(
                [],
                ['nodejs8.10'],
                [ '', 'myName' ],
                [
                    [vscode.Uri.file(path.join('my', 'quick', 'pick', 'result', '1'))],
                    [vscode.Uri.file(path.join('my', 'quick', 'pick', 'result', '2'))]
                ]
            )
            const wizard = new CreateNewSamAppWizard(context)
            const args = await wizard.run()

            assert.ok(args)
            assert.strictEqual(args!.location.fsPath, `${path.sep}${path.join('my', 'quick', 'pick', 'result', '2')}`)
            assert.strictEqual(args!.name, 'myName')
        })
    })
})
