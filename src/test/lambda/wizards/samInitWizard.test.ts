/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import * as immutable from 'immutable'
import * as path from 'path'
import * as vscode from 'vscode'
import { SamLambdaRuntime } from '../../../lambda/models/samLambdaRuntime'
import {
    CreateNewSamAppWizard,
    CreateNewSamAppWizardContext
} from '../../../lambda/wizards/samInitWizard'

function isMultiDimensionalArray(array: any[] | any[][] | undefined): boolean {
    if (!array) {
        return false
    }

    for (const item of array) {
        if (Array.isArray(item)) {
            return true
        }
    }

    return false
}

class MockCreateNewSamAppWizardContext implements CreateNewSamAppWizardContext {
    /**
     * @param  {vscode.WorkspaceFolder[] | vscode.WorkspaceFolder[][]} _workspaceFolders
     *         The value to return from context.workspaceFolders.
     * @param  {immutable.Set<SamLambdaRuntime> | immutable.Set<SamLambdaRuntime>[]} _lambdaRuntimes
     *         The value to return from context.lambdaRuntimes.
     * @param  {string | string[]} inputBoxResult
     *         The value to return from context.showInputBox.
     * @param  {(vscode.Uri[] | undefined) | (vscode.Uri[] | undefined)[]} openDialogResult
     *         The value to return from context.showOpenDialog.
     *
     * Each parameter may be a single value (in which case that value is always returned),
     * or an array of values (in which case each invocation will return the next item from the array).
     */
    public constructor(
        private readonly _workspaceFolders: vscode.WorkspaceFolder[] | vscode.WorkspaceFolder[][],
        private readonly _lambdaRuntimes: immutable.Set<SamLambdaRuntime> | immutable.Set<SamLambdaRuntime>[],
        private readonly inputBoxResult: string | string[],
        private readonly openDialogResult: (vscode.Uri[] | undefined) | (vscode.Uri[] | undefined)[]
    ) {
        if (isMultiDimensionalArray(this._workspaceFolders)) {
            this._workspaceFolders = (_workspaceFolders as vscode.WorkspaceFolder[][]).reverse()
        }
        if (Array.isArray(this._lambdaRuntimes)) {
            this._lambdaRuntimes = (_lambdaRuntimes as immutable.Set<SamLambdaRuntime>[]).reverse()
        }
        if (Array.isArray(this.inputBoxResult)) {
            this.inputBoxResult = (inputBoxResult as string[]).reverse()
        }
        if (isMultiDimensionalArray(this.openDialogResult)) {
            this.openDialogResult = (openDialogResult as vscode.Uri[][]).reverse()
        }
    }

    public get lambdaRuntimes(): immutable.Set<SamLambdaRuntime> {
        if (Array.isArray(this._lambdaRuntimes)) {
            if (this._lambdaRuntimes!.length <= 0) {
                throw new Error('lambdaRuntimes was called more times than expected')
            }

            return (this._lambdaRuntimes as immutable.Set<SamLambdaRuntime>[]).pop() || immutable.Set()
        }

        return (this._lambdaRuntimes as immutable.Set<SamLambdaRuntime>) || immutable.Set()
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

    public async promptUserForRuntime(
        currRuntime?: SamLambdaRuntime
    ): Promise<SamLambdaRuntime | undefined> {
        return this.lambdaRuntimes.toArray().pop()
    }

    public async promptUserForLocation(): Promise<vscode.Uri | undefined> {
        if (this.workspaceFolders && this.workspaceFolders.length > 0) {
            const temp = this.workspaceFolders[0]

            return temp ? temp.uri : undefined
        } else {
            const locations = await this.showOpenDialog({})

            return locations ? locations.pop() : undefined
        }
    }

    public async promptUserForName(): Promise<string | undefined> {
        if (typeof this.inputBoxResult === 'string') {
            return this.inputBoxResult
        }

        if (this.inputBoxResult.length <= 0) {
            throw new Error('inputBoxResult was called more times than expected')
        }

        return this.inputBoxResult.pop()
    }
}

describe('CreateNewSamAppWizard', async () => {
    describe('runtime', async () => {
        it('uses user response as runtime', async () => {
            const context: CreateNewSamAppWizardContext = new MockCreateNewSamAppWizardContext(
                [],
                immutable.Set<SamLambdaRuntime>(['nodejs8.10']),
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
                immutable.Set<SamLambdaRuntime>(),
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
                immutable.Set<SamLambdaRuntime>(['nodejs8.10']),
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
                [
                    immutable.Set<SamLambdaRuntime>(['python3.6']),
                    immutable.Set<SamLambdaRuntime>(['nodejs8.10'])
                ],
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
                immutable.Set<SamLambdaRuntime>(['nodejs8.10']),
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
                immutable.Set<SamLambdaRuntime>(['nodejs8.10']),
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
                immutable.Set<SamLambdaRuntime>(['nodejs8.10']),
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
                immutable.Set<SamLambdaRuntime>(['nodejs8.10']),
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
