/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { Set } from 'immutable'
import * as path from 'path'
import * as vscode from 'vscode'
import { JAVA, PYTHON, SchemaCodeLangs } from '../../../eventSchemas/models/schemaCodeLangs'
import {
    SchemaCodeDownloadWizard,
    SchemaCodeDownloadWizardContext,
} from '../../../eventSchemas/wizards/schemaCodeDownloadWizard'

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

class MockSchemaCodeDownloadWizardContext implements SchemaCodeDownloadWizardContext {
    public get schemaVersions(): string[] {
        if (Array.isArray(this._schemaVersions)) {
            if (this._schemaVersions!.length <= 0) {
                throw new Error('schemaLangs was called more times than expected')
            }

            ;(this._schemaVersions as string[]).pop()

            return (this._schemaVersions as string[]) || []
        }

        return [this._schemaVersions] || []
    }

    public get schemaLangs(): Set<SchemaCodeLangs> {
        if (Array.isArray(this._schemaLangs)) {
            if (this._schemaLangs!.length <= 0) {
                throw new Error('schemaLangs was called more times than expected')
            }

            return (this._schemaLangs as Set<SchemaCodeLangs>[]).pop() || Set()
        }

        return (this._schemaLangs as Set<SchemaCodeLangs>) || Set()
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

    /**
     * @param  {vscode.WorkspaceFolder[] | vscode.WorkspaceFolder[][]} _workspaceFolders
     *         The value to return from context.workspaceFolders.
     * @param  {immutable.Set<SchemaCodeLangs> | Set<immutable.SchemaCodeLangs>[]} _schemaLangs
     *         The value to return from context.schemaLangs.
     * @param  {string | string[]} _schemaVersions
     *         The value to return from context.showInputBox.
     * @param  {(vscode.Uri[] | undefined) | (vscode.Uri[] | undefined)[]} openDialogResult
     *         The value to return from context.showOpenDialog.
     *
     * Each parameter may be a single value (in which case that value is always returned),
     * or an array of values (in which case each invocation will return the next item from the array).
     */
    public constructor(
        private readonly _workspaceFolders: vscode.WorkspaceFolder[] | vscode.WorkspaceFolder[][],
        private readonly _schemaLangs: (Set<SchemaCodeLangs> | undefined) | (Set<SchemaCodeLangs>[] | undefined),
        private readonly _schemaVersions: string | string[],
        private readonly openDialogResult: (vscode.Uri[] | undefined) | (vscode.Uri[] | undefined)[]
    ) {
        if (isMultiDimensionalArray(this._workspaceFolders)) {
            this._workspaceFolders = (_workspaceFolders as vscode.WorkspaceFolder[][]).reverse()
        }
        if (Array.isArray(this._schemaLangs)) {
            this._schemaLangs = (_schemaLangs as Set<SchemaCodeLangs>[]).reverse()
        }
        if (Array.isArray(this._schemaVersions)) {
            this._schemaVersions = (_schemaVersions as string[]).reverse()
        }
        if (isMultiDimensionalArray(this.openDialogResult)) {
            this.openDialogResult = (openDialogResult as vscode.Uri[][]).reverse()
        }
    }

    public async showOpenDialog(options: vscode.OpenDialogOptions): Promise<vscode.Uri[] | undefined> {
        if (isMultiDimensionalArray(this.openDialogResult)) {
            if (this.openDialogResult!.length <= 0) {
                throw new Error('showOpenDialog was called more times than expected')
            }

            return (this.openDialogResult as vscode.Uri[][]).pop()
        }

        return this.openDialogResult as vscode.Uri[]
    }

    public async promptUserForVersion(currVersion?: string): Promise<string | undefined> {
        return this.schemaVersions.pop()
    }

    public async promptUserForLanguage(currRuntime?: SchemaCodeLangs): Promise<SchemaCodeLangs | undefined> {
        return this.schemaLangs.toArray().pop()
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
}

describe('SchemaCodeDownloadWizard', async function () {
    describe('version', async function () {
        it('uses user response as schemaVersion', async function () {
            const context: SchemaCodeDownloadWizardContext = new MockSchemaCodeDownloadWizardContext(
                [],
                Set<SchemaCodeLangs>([JAVA]),
                'schemaVersion3',
                [vscode.Uri.file(path.join('my', 'workspace', 'folder'))]
            )
            const wizard = new SchemaCodeDownloadWizard(context)

            const args = await wizard.run()

            assert.ok(args)
            assert.strictEqual(args!.schemaVersion, 'schemaVersion3')
        })

        it('exits when cancelled', async function () {
            const context: SchemaCodeDownloadWizardContext = new MockSchemaCodeDownloadWizardContext(
                [],
                Set<SchemaCodeLangs>([JAVA]),
                '',
                [vscode.Uri.file(path.join('my', 'workspace', 'folder'))]
            )
            const wizard = new SchemaCodeDownloadWizard(context)
            const args = await wizard.run()

            assert.ok(!args)
        })
    })

    describe('language', async function () {
        it('uses user response as language', async function () {
            const context: SchemaCodeDownloadWizardContext = new MockSchemaCodeDownloadWizardContext(
                [],
                Set<SchemaCodeLangs>([JAVA]),
                'schemaVersion3',
                [vscode.Uri.file(path.join('my', 'workspace', 'folder'))]
            )
            const wizard = new SchemaCodeDownloadWizard(context)
            const args = await wizard.run()

            assert.ok(args)
            assert.strictEqual(args!.language, JAVA)
        })

        it('backtracks when cancelled', async function () {
            const context: SchemaCodeDownloadWizardContext = new MockSchemaCodeDownloadWizardContext(
                [],
                Set(),
                ['schemaVersion1', 'schemaVersion2', 'schemaVersion3'],
                [vscode.Uri.file(path.join('my', 'workspace', 'folder'))]
            )
            const wizard = new SchemaCodeDownloadWizard(context)
            const args = await wizard.run()

            assert.ok(!args)
        })
    })

    describe('location', async function () {
        it('uses user response as location', async function () {
            const locationPath = path.join('my', 'quick', 'pick', 'result')
            const context: SchemaCodeDownloadWizardContext = new MockSchemaCodeDownloadWizardContext(
                [],
                Set<SchemaCodeLangs>([JAVA]),
                'myVersion',
                [vscode.Uri.file(locationPath)]
            )
            const wizard = new SchemaCodeDownloadWizard(context)
            const args = await wizard.run()

            assert.ok(args)
            assert.strictEqual(args!.location.fsPath, `${path.sep}${locationPath}`)
        })

        it('backtracks when cancelled', async function () {
            const locationPath = path.join('my', 'quick', 'pick', 'result')
            const context: SchemaCodeDownloadWizardContext = new MockSchemaCodeDownloadWizardContext(
                [],
                [Set<SchemaCodeLangs>([PYTHON]), Set<SchemaCodeLangs>([JAVA])],
                'myName',
                [undefined, [vscode.Uri.file(locationPath)]]
            )
            const wizard = new SchemaCodeDownloadWizard(context)
            const args = await wizard.run()

            assert.ok(args)
            assert.strictEqual(args!.language, JAVA)
            assert.strictEqual(args!.location.fsPath, `${path.sep}${locationPath}`)
        })

        it("contains a 'browse' option", async () => {
            const name = 'myInputBoxResult'
            const locationPath = path.join('my', 'quick', 'pick', 'result')

            const context: SchemaCodeDownloadWizardContext = new MockSchemaCodeDownloadWizardContext(
                [],
                Set<SchemaCodeLangs>([JAVA]),
                name,
                [vscode.Uri.file(locationPath)]
            )
            const wizard = new SchemaCodeDownloadWizard(context)
            const args = await wizard.run()

            assert.ok(args)
            assert.strictEqual(args!.location.fsPath, `${path.sep}${locationPath}`)
        })

        it('contains an option for each workspace folder', async function () {
            const workspaceFolderPaths = [path.join('workspace', 'folder', '1'), path.join('workspace', 'folder', '2')]

            let index = 0
            const context: SchemaCodeDownloadWizardContext = new MockSchemaCodeDownloadWizardContext(
                workspaceFolderPaths.map(p => ({
                    uri: vscode.Uri.file(p),
                    name: path.basename(p),
                    index: index++,
                })),
                Set<SchemaCodeLangs>([JAVA]),
                'myName',
                []
            )
            const wizard = new SchemaCodeDownloadWizard(context)
            const args = await wizard.run()

            assert.ok(args)
            assert.strictEqual(args!.location.fsPath, `${path.sep}${workspaceFolderPaths[0]}`)
        })
    })
})
