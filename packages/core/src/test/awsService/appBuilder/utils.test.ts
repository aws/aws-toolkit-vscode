/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import * as vscode from 'vscode'
import assert from 'assert'
import { getTestWindow } from '../../shared/vscode/window'

import * as deploySamApplication from '../../../lambda/commands/deploySamApplication'
import * as syncSam from '../../../shared/sam/sync'
import fs from '../../../shared/fs/fs'
import { ResourceNode } from '../../../awsService/appBuilder/explorer/nodes/resourceNode'
import path from 'path'
import { SERVERLESS_FUNCTION_TYPE } from '../../../shared/cloudformation/cloudformation'
import { runOpenHandler, runOpenTemplate } from '../../../awsService/appBuilder/utils'
import { TreeNode } from '../../../shared/treeview/resourceTreeDataProvider'
import { assertTextEditorContains } from '../../testUtil'

interface TestScenario {
    runtime: string
    handler: string
    codeUri: string
    fileLocation: string
    fileInfo: string
    regex: RegExp
}

const scenarios: TestScenario[] = [
    {
        runtime: 'java21',
        handler: 'resizer.App::handleRequest',
        codeUri: 'ResizerFunction',
        fileLocation: 'ResizerFunction/src/main/java/resizer/App.java',
        fileInfo: 'test',
        regex: /App.java/g,
    },
    {
        runtime: 'dotnet6',
        handler: 'ImageResize::ImageResize.Function::FunctionHandler',
        codeUri: 'ImageResize/',
        fileLocation: 'ImageResize/Function.cs',
        fileInfo: 'test',
        regex: /Function.cs/g,
    },
    {
        runtime: 'python3.9',
        handler: 'app.lambda_handler',
        codeUri: 'hello_world/',
        fileLocation: 'hello_world/app.py',
        fileInfo: 'test',
        regex: /app.py/g,
    },
    {
        runtime: 'nodejs18.x',
        handler: 'app.handler',
        codeUri: 'src/',
        fileLocation: 'src/app.js',
        fileInfo: 'test',
        regex: /app.js/g,
    },
]

describe('AppBuilder Utils', function () {
    describe('deploy sync prompt', function () {
        let sandbox: sinon.SinonSandbox
        beforeEach(function () {
            sandbox = sinon.createSandbox()
        })

        afterEach(function () {
            sandbox.restore()
        })

        it('deploy is selected', async function () {
            // Given
            const deploy = sandbox.stub(deploySamApplication, 'runDeploy').resolves()
            const sync = sandbox.stub(syncSam, 'runSync').resolves()
            getTestWindow().onDidShowQuickPick((picker) => {
                assert.strictEqual(picker.items[0].label, 'Sync')
                assert.strictEqual(picker.items[1].label, 'Deploy')
                assert.strictEqual(picker.items.length, 2)
                picker.acceptItem(picker.items[1])
            })
            await vscode.commands.executeCommand('aws.appBuilder.deploy')
            // Then
            assert(deploy.called)
            assert(sync.notCalled)
        })

        it('sync is selected', async function () {
            // Given
            const deploy = sandbox.stub(deploySamApplication, 'runDeploy').resolves()
            const sync = sandbox.stub(syncSam, 'runSync').resolves()
            getTestWindow().onDidShowQuickPick((picker) => {
                assert.strictEqual(picker.items[0].label, 'Sync')
                assert.strictEqual(picker.items[1].label, 'Deploy')
                assert.strictEqual(picker.items.length, 2)
                picker.acceptItem(picker.items[0])
            })
            await vscode.commands.executeCommand('aws.appBuilder.deploy')
            // Then
            assert(deploy.notCalled)
            assert(sync.called)
        })

        it('customer exit should not call any function', async function () {
            // Given
            const deploy = sandbox.stub(deploySamApplication, 'runDeploy').resolves()
            const sync = sandbox.stub(syncSam, 'runSync').resolves()
            getTestWindow().onDidShowQuickPick((picker) => {
                assert.strictEqual(picker.items[0].label, 'Sync')
                assert.strictEqual(picker.items[1].label, 'Deploy')
                assert.strictEqual(picker.items.length, 2)
                picker.dispose()
            })
            await vscode.commands.executeCommand('aws.appBuilder.deploy')
            // Then
            assert(deploy.notCalled)
            assert(sync.notCalled)
        })
    }),
        describe('openHandler', function () {
            let sandbox: sinon.SinonSandbox
            const workspace = vscode.workspace.workspaceFolders?.[0]
            assert.ok(workspace)
            const tempFolder = path.join(workspace.uri.fsPath, 'temp')

            beforeEach(async function () {
                sandbox = sinon.createSandbox()
                await fs.mkdir(tempFolder)
            })

            afterEach(async function () {
                await fs.delete(tempFolder, { recursive: true })
                sandbox.restore()
            })

            for (const scenario of scenarios) {
                it(`should open ${scenario.runtime}`, async function () {
                    // Given
                    const rNode = new ResourceNode(
                        {
                            samTemplateUri: vscode.Uri.file(path.join(tempFolder, 'template.yaml')),
                            workspaceFolder: workspace,
                            projectRoot: vscode.Uri.file(tempFolder),
                        },
                        {
                            Id: 'MyFunction',
                            Type: SERVERLESS_FUNCTION_TYPE,
                            Runtime: scenario.runtime,
                            Handler: scenario.handler,
                            CodeUri: scenario.codeUri,
                        }
                    )
                    await fs.mkdir(path.join(tempFolder, ...path.dirname(scenario.fileLocation).split('/')))
                    await fs.writeFile(path.join(tempFolder, ...scenario.fileLocation.split('/')), scenario.fileInfo)
                    await runOpenHandler(rNode)
                    // Then
                    assert.strictEqual(
                        vscode.window.activeTextEditor?.document.fileName,
                        path.join(tempFolder, ...scenario.fileLocation.split('/'))
                    )
                    await assertTextEditorContains(scenario.fileInfo)
                })
            }
        }),
        describe('open template', function () {
            let sandbox: sinon.SinonSandbox
            const workspace = vscode.workspace.workspaceFolders?.[0]
            assert.ok(workspace)
            const tempFolder = path.join(workspace.uri.fsPath, 'temp')

            beforeEach(async function () {
                sandbox = sinon.createSandbox()
                await fs.mkdir(tempFolder)
            })

            afterEach(async function () {
                await fs.delete(tempFolder, { recursive: true })
                sandbox.restore()
            })

            it('select template should succeed', async function () {
                const tNode = {
                    id: 'MyFunction',
                    resource: {
                        // this doesn't exist
                        samTemplateUri: vscode.Uri.file(path.join(tempFolder, 'abc', 'template.yaml')),
                        workspaceFolder: workspace,
                        projectRoot: vscode.Uri.file(tempFolder),
                    },
                }
                getTestWindow().onDidShowQuickPick((picker) => {
                    picker.acceptItem(picker.items[0])
                })
                await fs.mkdir(path.join(tempFolder, 'abc'))
                await fs.writeFile(path.join(tempFolder, 'abc', 'template.yaml'), 'testyaml')

                await vscode.commands.executeCommand('aws.appBuilder.openTemplate', tNode)
                // Then
                assert.strictEqual(
                    vscode.window.activeTextEditor?.document.fileName,
                    path.join(tempFolder, 'abc', 'template.yaml')
                )
                await assertTextEditorContains('testyaml')
            })

            it('should raise if no template', async function () {
                // Given
                const openCommand = sandbox.spy(vscode.workspace, 'openTextDocument')
                const showCommand = sandbox.spy(vscode.window, 'showTextDocument')
                const tNode = {
                    id: 'MyFunction',
                    resource: {
                        // this doesn't exist
                        samTemplateUri: vscode.Uri.file(path.join(tempFolder, 'template.yaml')),
                        workspaceFolder: workspace,
                        projectRoot: vscode.Uri.file(tempFolder),
                    },
                }
                try {
                    await runOpenTemplate(tNode as TreeNode)
                    assert.fail('No template provided')
                } catch (err) {
                    assert.strictEqual((err as Error).message, 'No template provided')
                }
                // Then
                assert(openCommand.neverCalledWith(sinon.match.has('fspath', sinon.match(/template.yaml/g))))
                assert(showCommand.notCalled)
            })
        })
})
