/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { Runtime } from 'aws-sdk/clients/lambda'
import { Set } from 'immutable'
import * as path from 'path'
import * as fs from 'fs'
import * as vscode from 'vscode'
import {
    eventBridgeHelloWorldTemplate,
    eventBridgeStarterAppTemplate,
    helloWorldTemplate,
    SamTemplate,
} from '../../../lambda/models/samTemplates'
import {
    CreateNewSamAppWizard,
    CreateNewSamAppWizardContext,
    CreateNewSamAppWizardResponse,
} from '../../../lambda/wizards/samInitWizard'
import { DependencyManager, RuntimePackageType } from '../../../lambda/models/samLambdaRuntime'
import { makeTemporaryToolkitFolder } from '../../../shared/filesystemUtilities'
import { assertEqualPaths } from '../../testUtil'

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
    public get lambdaRuntimes(): Set<Runtime> {
        if (Array.isArray(this._lambdaRuntimes)) {
            if (this._lambdaRuntimes!.length <= 0) {
                throw new Error('lambdaRuntimes was called more times than expected')
            }

            return (this._lambdaRuntimes as Set<Runtime>[]).pop() || Set()
        }

        return (this._lambdaRuntimes as Set<Runtime>) || Set()
    }

    public get samTemplates(): Set<SamTemplate> {
        if (Array.isArray(this._samTemplates)) {
            if (this._samTemplates!.length <= 0) {
                throw new Error('samTemplates was called more times than expected')
            }

            return (this._samTemplates as Set<SamTemplate>[]).pop() || Set()
        }

        return (this._samTemplates as Set<SamTemplate>) || Set()
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
     * @param  {immutable.Set<SamLambdaRuntime> | immutable.Set<SamLambdaRuntime>[]} _lambdaRuntimes
     *         The value to return from context.lambdaRuntimes.
     * @param  {string | string[]} inputBoxResult
     *         The value to return from context.showInputBox.
     * @param  {(vscode.Uri[] | undefined) | (vscode.Uri[] | undefined)[]} openDialogResult
     *         The value to return from context.showOpenDialog.
     * @param  {(immutable.Set<SamTemplate> | undefined) | (immutable.Set<SamTemplate> | undefined)[]} _samTemplates
     *         The value to return from context.samTemplates.
     * @param  {(string | undefined) | (string | undefined)[]} currRegion
     *         The value to return from context.currRegion.
     * @param  {(string | undefined) | (string | undefined)[]} currRegistry
     *         The value to return from context.currRegistry.
     * @param  {(string | undefined) | (string | undefined)[]} currSchema
     *         The value to return from context.currSchema.
     *
     * Each parameter may be a single value (in which case that value is always returned),
     * or an array of values (in which case each invocation will return the next item from the array).
     */
    public constructor(
        private readonly _workspaceFolders: vscode.WorkspaceFolder[] | vscode.WorkspaceFolder[][],
        private readonly _lambdaRuntimes: Set<Runtime> | Set<Runtime>[],
        private readonly _dependencyManagers: (DependencyManager | undefined)[],
        private readonly inputBoxResult: string | string[],
        private readonly openDialogResult: (vscode.Uri[] | undefined) | (vscode.Uri[] | undefined)[],
        private readonly _samTemplates: (Set<SamTemplate> | undefined) | (Set<SamTemplate> | undefined)[],
        private readonly currRegion: (string | undefined) | (string | undefined)[],
        private readonly currRegistry: (string | undefined) | (string | undefined)[],
        private readonly currSchema: (string | undefined) | (string | undefined)[]
    ) {
        if (isMultiDimensionalArray(this._workspaceFolders)) {
            this._workspaceFolders = (_workspaceFolders as vscode.WorkspaceFolder[][]).reverse()
        }
        if (Array.isArray(this._lambdaRuntimes)) {
            this._lambdaRuntimes = (_lambdaRuntimes as Set<Runtime>[]).reverse()
        }
        if (Array.isArray(this.inputBoxResult)) {
            this.inputBoxResult = (inputBoxResult as string[]).reverse()
        }
        if (isMultiDimensionalArray(this.openDialogResult)) {
            this.openDialogResult = (openDialogResult as vscode.Uri[][]).reverse()
        }
        if (Array.isArray(this._samTemplates)) {
            this._samTemplates = (_samTemplates as Set<SamTemplate>[]).reverse()
        }
        if (Array.isArray(this.currRegion)) {
            this.currRegion = (currRegion as string[]).reverse()
        }
        if (Array.isArray(this.currRegistry)) {
            this.currRegistry = (currRegistry as string[]).reverse()
        }
        if (Array.isArray(this.currSchema)) {
            this.currSchema = (currSchema as string[]).reverse()
        }
        // keeps things in line with the set reverse above
        this._dependencyManagers = this._dependencyManagers.reverse()
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

    public async promptUserForRuntimeAndDependencyManager(
        currRuntime?: Runtime
    ): Promise<[Runtime, RuntimePackageType, DependencyManager | undefined] | undefined> {
        const runtime = this.lambdaRuntimes.toArray().pop()
        return runtime ? [runtime, 'Zip', this._dependencyManagers.pop()] : undefined
    }

    public async promptUserForTemplate(
        currRuntime: Runtime,
        packageType: RuntimePackageType,
        currTemplate?: SamTemplate
    ): Promise<SamTemplate | undefined> {
        return this.samTemplates.toArray().pop()
    }

    public async promptUserForRegion(currRegion?: string): Promise<string | undefined> {
        return this.getUserInput(this.currRegion, 'region')
    }

    public async promptUserForRegistry(currRegion: string, currRegistry?: string): Promise<string | undefined> {
        return this.getUserInput(this.currRegistry, 'registry')
    }

    public async promptUserForSchema(
        currRegion: string,
        currRegistry: string,
        currSchema?: string
    ): Promise<string | undefined> {
        return this.getUserInput(this.currSchema, 'schema')
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

    public async promptUserForName(defaultValue: string): Promise<string | undefined> {
        return this.getUserInput(this.inputBoxResult, 'inputBoxResult')
    }

    public getUserInput(
        helperValue: string | (string | undefined)[] | undefined,
        description: string
    ): string | undefined {
        if (!helperValue || typeof helperValue === 'string') {
            return helperValue
        }

        if (helperValue.length <= 0) {
            throw new Error(`${description} was called more times than expected`)
        }

        return helperValue.pop()
    }
}

describe('CreateNewSamAppWizard', async function () {
    let dir: string
    let dir2: string
    before(async function () {
        dir = await makeTemporaryToolkitFolder()
        dir2 = await makeTemporaryToolkitFolder()
    })
    after(async function () {
        fs.rmdirSync(dir)
    })

    describe('runtime and dependency manager', async function () {
        it('uses user response as runtime', async function () {
            const context: CreateNewSamAppWizardContext = new MockCreateNewSamAppWizardContext(
                [],
                Set<Runtime>(['nodejs14.x']),
                ['npm'],
                'myName',
                [vscode.Uri.file(dir)],
                Set<SamTemplate>([helloWorldTemplate]),
                [],
                [],
                []
            )
            const wizard = new CreateNewSamAppWizard(context)
            const args = await wizard.run()

            assert.ok(args)
            assert.strictEqual(args!.runtime, 'nodejs14.x')
            assert.strictEqual(args!.dependencyManager, 'npm')
        })

        it('selects a runtime, restarts the step if a dependency manager is not set, and continues on', async function () {
            const context: CreateNewSamAppWizardContext = new MockCreateNewSamAppWizardContext(
                [],
                Set<Runtime>(['java11', 'nodejs14.x']),
                [undefined, 'npm'],
                'myName',
                [vscode.Uri.file(dir)],
                Set<SamTemplate>([helloWorldTemplate]),
                [],
                [],
                []
            )
            const wizard = new CreateNewSamAppWizard(context)
            const args = await wizard.run()

            assert.ok(args)
            assert.strictEqual(args!.runtime, 'nodejs14.x')
            assert.strictEqual(args!.dependencyManager, 'npm')
        })

        it('exits when cancelled', async function () {
            const context: CreateNewSamAppWizardContext = new MockCreateNewSamAppWizardContext(
                [],
                Set<Runtime>(),
                [],
                'myName',
                [vscode.Uri.file(dir)],
                [],
                [],
                [],
                []
            )
            const wizard = new CreateNewSamAppWizard(context)
            const args = await wizard.run()

            assert.ok(!args)
        })

        it('exits when a runtime is selected, a dependency manager is not, and then cancelled', async function () {
            const context: CreateNewSamAppWizardContext = new MockCreateNewSamAppWizardContext(
                [],
                [Set<Runtime>('java11'), Set<Runtime>()],
                [],
                'myName',
                [vscode.Uri.file(dir)],
                [],
                [],
                [],
                []
            )
            const wizard = new CreateNewSamAppWizard(context)
            const args = await wizard.run()

            assert.ok(!args)
        })
    })

    describe('template', async function () {
        it('uses user response as template', async function () {
            const context: CreateNewSamAppWizardContext = new MockCreateNewSamAppWizardContext(
                [],
                Set<Runtime>(['nodejs14.x']),
                ['npm'],
                'myName',
                [vscode.Uri.file(dir)],
                Set<SamTemplate>([helloWorldTemplate]),
                [],
                [],
                []
            )
            const wizard = new CreateNewSamAppWizard(context)
            const args = await wizard.run()

            assert.ok(args)
            assert.strictEqual(args!.template, helloWorldTemplate)
        })

        it('backtracks when cancelled', async function () {
            const context: CreateNewSamAppWizardContext = new MockCreateNewSamAppWizardContext(
                [],
                [Set<Runtime>(['python3.6']), Set<Runtime>(['nodejs14.x'])],
                ['pip', 'npm'],
                'myName',
                [vscode.Uri.file(dir)],
                [undefined, Set<SamTemplate>([helloWorldTemplate])],
                [],
                [],
                []
            )
            const wizard = new CreateNewSamAppWizard(context)
            const args = await wizard.run()

            assert.ok(args)
            assert.strictEqual(args!.runtime, 'nodejs14.x')
            assert.strictEqual(args!.template, helloWorldTemplate)
        })

        describe('eventBridge-schema-app template', async function () {
            let locationPath: string
            before(async function () {
                locationPath = await makeTemporaryToolkitFolder()
            })
            after(async function () {
                fs.rmdirSync(locationPath)
            })
            let context: CreateNewSamAppWizardContext
            let wizard: CreateNewSamAppWizard
            let args: CreateNewSamAppWizardResponse | undefined

            beforeEach(async function () {
                context = new MockCreateNewSamAppWizardContext(
                    [],
                    Set<Runtime>(['nodejs14.x']),
                    ['npm'],
                    'myName',
                    [vscode.Uri.file(locationPath)],
                    Set<SamTemplate>([eventBridgeStarterAppTemplate]),
                    'us-west-2',
                    'aws.events',
                    'AWSAPICallViaCloudTrail'
                )
                wizard = new CreateNewSamAppWizard(context)
                args = await wizard.run()
            })

            describe('region', async function () {
                it('uses user response as region', async function () {
                    assert.ok(args)
                    assert.strictEqual(args!.region, 'us-west-2')
                })

                it('backtracks when cancelled', async function () {
                    context = new MockCreateNewSamAppWizardContext(
                        [],
                        [Set<Runtime>(['python3.6']), Set<Runtime>(['nodejs14.x'])],
                        ['pip', 'npm'],
                        'myName',
                        [vscode.Uri.file(locationPath)],
                        Set<SamTemplate>([eventBridgeStarterAppTemplate]),
                        [undefined, 'us-west-2'],
                        'aws.events',
                        'AWSAPICallViaCloudTrail'
                    )
                    wizard = new CreateNewSamAppWizard(context)
                    args = await wizard.run()

                    assert.ok(args)
                    assert.strictEqual(args!.template, eventBridgeStarterAppTemplate)
                    assert.strictEqual(args!.region, 'us-west-2')
                })
            })

            describe('registry', async function () {
                it('uses user response as registry', async function () {
                    assert.ok(args)
                    assert.strictEqual(args!.registryName, 'aws.events')
                })

                it('backtracks when cancelled', async function () {
                    context = new MockCreateNewSamAppWizardContext(
                        [],
                        [Set<Runtime>(['python3.6']), Set<Runtime>(['nodejs14.x'])],
                        ['pip', 'npm'],
                        'myName',
                        [vscode.Uri.file(locationPath)],
                        Set<SamTemplate>([eventBridgeStarterAppTemplate]),
                        ['us-west-2', 'us-east-1'],
                        [undefined, 'aws.events'],
                        'AWSAPICallViaCloudTrail'
                    )
                    wizard = new CreateNewSamAppWizard(context)
                    args = await wizard.run()

                    assert.ok(args)
                    assert.strictEqual(args!.region, 'us-east-1')
                    assert.strictEqual(args!.registryName, 'aws.events')
                })
            })

            describe('schema', async function () {
                it('uses user response as schema', async function () {
                    assert.ok(args)
                    assert.strictEqual(args!.schemaName, 'AWSAPICallViaCloudTrail')
                })

                it('backtracks when cancelled', async function () {
                    context = new MockCreateNewSamAppWizardContext(
                        [],
                        [Set<Runtime>(['python3.6']), Set<Runtime>(['nodejs14.x'])],
                        ['pip', 'npm'],
                        'myName',
                        [vscode.Uri.file(locationPath)],
                        Set<SamTemplate>([eventBridgeStarterAppTemplate]),
                        ['us-west-2', 'us-east-1'],
                        ['aws.events', 'custom-events'],
                        [undefined, 'AWSAPICallViaCloudTrail']
                    )
                    wizard = new CreateNewSamAppWizard(context)
                    args = await wizard.run()

                    assert.ok(args)
                    assert.strictEqual(args!.registryName, 'custom-events')
                    assert.strictEqual(args!.schemaName, 'AWSAPICallViaCloudTrail')
                })
            })

            describe('location', async function () {
                it('uses user response as schema', async function () {
                    assert.ok(args)
                    assertEqualPaths(args!.location.fsPath, locationPath)
                })

                it('backtracks when cancelled', async function () {
                    context = new MockCreateNewSamAppWizardContext(
                        [],
                        [Set<Runtime>(['python3.6']), Set<Runtime>(['nodejs14.x'])],
                        ['pip', 'npm'],
                        'myName',
                        [undefined, [vscode.Uri.file(locationPath)]],
                        Set<SamTemplate>([eventBridgeStarterAppTemplate]),
                        ['us-west-2', 'us-east-1'],
                        ['aws.events', 'custom-events'],
                        ['AWSAPICallViaCloudTrail', 'AWSBatchJobStateChange']
                    )
                    wizard = new CreateNewSamAppWizard(context)
                    args = await wizard.run()

                    assert.ok(args)
                    assert.strictEqual(args!.schemaName, 'AWSBatchJobStateChange')
                    assertEqualPaths(args!.location.fsPath, locationPath)
                })
            })
        })
    })

    describe('location', async function () {
        it('uses user response as location', async function () {
            const context: CreateNewSamAppWizardContext = new MockCreateNewSamAppWizardContext(
                [],
                Set<Runtime>(['nodejs14.x']),
                ['npm'],
                'myName',
                [vscode.Uri.file(dir)],
                Set<SamTemplate>([helloWorldTemplate]),
                [],
                [],
                []
            )
            const wizard = new CreateNewSamAppWizard(context)
            const args = await wizard.run()

            assert.ok(args)
            assertEqualPaths(args!.location.fsPath, dir)
        })

        it('backtracks when cancelled', async function () {
            const context: CreateNewSamAppWizardContext = new MockCreateNewSamAppWizardContext(
                [],
                [Set<Runtime>(['python3.6']), Set<Runtime>(['nodejs14.x'])],
                ['pip', 'npm'],
                'myName',
                [undefined, [vscode.Uri.file(dir)]],
                [Set<SamTemplate>([helloWorldTemplate]), Set<SamTemplate>([eventBridgeHelloWorldTemplate])],
                [],
                [],
                []
            )
            const wizard = new CreateNewSamAppWizard(context)
            const args = await wizard.run()

            assert.ok(args)
            assert.strictEqual(args!.template, eventBridgeHelloWorldTemplate)
            assertEqualPaths(args!.location.fsPath, dir)
        })

        it("contains a 'browse' option", async () => {
            const name = 'myInputBoxResult'
            const context: CreateNewSamAppWizardContext = new MockCreateNewSamAppWizardContext(
                [],
                Set<Runtime>(['nodejs14.x']),
                ['npm'],
                name,
                [vscode.Uri.file(dir)],
                Set<SamTemplate>([helloWorldTemplate]),
                [],
                [],
                []
            )
            const wizard = new CreateNewSamAppWizard(context)
            const args = await wizard.run()

            assert.ok(args)
            assertEqualPaths(args!.location.fsPath, dir)
        })

        it('contains an option for each workspace folder', async function () {
            const workspaceFolderPaths = [dir, dir2]

            let index = 0
            const context: CreateNewSamAppWizardContext = new MockCreateNewSamAppWizardContext(
                workspaceFolderPaths.map(p => ({
                    uri: vscode.Uri.file(p),
                    name: path.basename(p),
                    index: index++,
                })),
                Set<Runtime>(['nodejs14.x']),
                ['npm'],
                'myName',
                [],
                Set<SamTemplate>([helloWorldTemplate]),
                [],
                [],
                []
            )
            const wizard = new CreateNewSamAppWizard(context)
            const args = await wizard.run()

            assert.ok(args)
            assertEqualPaths(args!.location.fsPath, workspaceFolderPaths[0])
        })
    })

    describe('name', async function () {
        it('uses user response as name', async function () {
            const context: CreateNewSamAppWizardContext = new MockCreateNewSamAppWizardContext(
                [],
                Set<Runtime>(['nodejs14.x']),
                ['npm'],
                'myName',
                [vscode.Uri.file(dir)],
                Set<SamTemplate>([helloWorldTemplate]),
                [],
                [],
                []
            )
            const wizard = new CreateNewSamAppWizard(context)
            const args = await wizard.run()

            assert.ok(args)
            assert.strictEqual(args!.name, 'myName')
        })

        it('backtracks when cancelled', async function () {
            const context: CreateNewSamAppWizardContext = new MockCreateNewSamAppWizardContext(
                [],
                Set<Runtime>(['nodejs14.x']),
                ['npm'],
                ['', 'myName'],
                [[vscode.Uri.file(dir)], [vscode.Uri.file(dir2)]],
                Set<SamTemplate>([helloWorldTemplate]),
                [],
                [],
                []
            )
            const wizard = new CreateNewSamAppWizard(context)
            const args = await wizard.run()

            assert.ok(args)
            assertEqualPaths(args!.location.fsPath, dir2)
            assert.strictEqual(args!.name, 'myName')
        })
    })
})
