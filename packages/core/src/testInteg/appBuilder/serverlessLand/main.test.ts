/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as vscode from 'vscode'
import path from 'path'
import { PrompterTester } from '../../../test/shared/wizards/prompterTester'
import { describe } from 'mocha'
import { ProjectMetadata } from '../../../awsService/appBuilder/serverlessLand/metadataManager'
import fs from '../../../shared/fs/fs'
import { AppBuilderRootNode } from '../../../awsService/appBuilder/explorer/nodes/rootNode'
import * as sinon from 'sinon'
import { AppNode } from '../../../awsService/appBuilder/explorer/nodes/appNode'
import { ResourceNode } from '../../../awsService/appBuilder/explorer/nodes/resourceNode'
import { getTestWindow } from '../../../test/shared/vscode/window'

describe('Serverless Land Integration', async () => {
    const metadataPath = path.resolve(
        __dirname,
        '../../../../../src/awsService/appBuilder/serverlessLand/metadata.json'
    )
    const metadataContent = await fs.readFileText(metadataPath)
    const parseMetadata = JSON.parse(metadataContent) as ProjectMetadata
    const workspaceFolder = vscode.workspace.workspaceFolders![0]
    const projectFolder = 'my-project-from-Serverless-Land'
    let rootNode: sinon.SinonSpiedInstance<AppBuilderRootNode>
    let sandbox: sinon.SinonSandbox

    beforeEach(async () => {
        sandbox = sinon.createSandbox()
        await fs.delete(path.join(workspaceFolder.uri.fsPath, projectFolder), { recursive: true })
        rootNode = sandbox.spy(AppBuilderRootNode.instance)
    })

    afterEach(async () => {
        await fs.delete(path.join(workspaceFolder.uri.fsPath, projectFolder), { recursive: true })
    })

    describe('Happy Path', async () => {
        it('creates an AppBuilderRootNode with correct label', async () => {
            /**
             * Selection:
             *  - pattern               : [Select]  2   apigw-rest-api-lambda-sam
             *  - runtime               : [Select]  3   dotnet
             *  - iac                   : [Select]  1   sam
             *  - location              : [Input]   From TestFolder.uri
             *  - name                  : [Input]   "my-project-from-Serverless-Land"
             */

            const testWindow = getTestWindow()
            const prompterTester = PrompterTester.init({ testWindow })
                .handleQuickPick('Select a Pattern for your application', async (quickPick) => {
                    await quickPick.untilReady()
                    const options = quickPick.items
                    Object.entries(parseMetadata.patterns).map(([key, pattern]) => {
                        options.find((option) => option.label === key && option.detail === pattern.description)
                    })
                    quickPick.acceptItem(quickPick.items[1])
                })
                .handleQuickPick('Select Runtime', async (quickPick) => {
                    await quickPick.untilReady()
                    const options = quickPick.items
                    assert.strictEqual(options[0].label, 'python')
                    assert.strictEqual(options[1].label, 'javascript')
                    assert.strictEqual(options[2].label, 'java')
                    assert.strictEqual(options[3].label, 'dotnet')
                    quickPick.acceptItem(options[3])
                })
                .handleQuickPick('Select IaC', async (quickPick) => {
                    await quickPick.untilReady()
                    const options = quickPick.items
                    assert.strictEqual(options[0].label, 'sam')
                    quickPick.acceptItem(options[0])
                })
                .handleQuickPick('Select Project Location', async (quickPick) => {
                    await quickPick.untilReady()
                    const options = quickPick.items
                    assert.strictEqual(options[0].label, '$(folder) workspaceFolder')
                    assert.strictEqual(options[1].label, '$(folder-opened) Select a folder...')
                    quickPick.acceptItem(options[0])
                })
                .handleInputBox('Enter Project Name', (inputBox) => {
                    inputBox.acceptValue('my-project-from-Serverless-Land')
                })
                .build()

            // Validate that the README.md is shown.
            testWindow.onDidChangeActiveTextEditor((editors) => {
                assert(editors)
                const readMe = path.join(workspaceFolder.uri.fsPath, projectFolder, 'README.md')
                assert.strictEqual(editors?.document.fileName, readMe)
            })

            await vscode.commands.executeCommand('aws.toolkit.lambda.createServerlessLandProject')

            // projectNodes set from previous step

            const projectNode = await rootNode
                .getChildren()
                .then(
                    (children) =>
                        children.find(
                            (node) =>
                                node instanceof AppNode &&
                                node.label === 'workspaceFolder/my-project-from-Serverless-Land'
                        ) as AppNode | undefined
                )

            assert.ok(projectNode, 'Expect Serverless Land project node in Application Builder')

            // Check App Builder resources
            const resourceNodes = await projectNode.getChildren()
            assert.strictEqual(resourceNodes.length, 1)
            assert.ok(resourceNodes[0] instanceof ResourceNode)

            // Validate Lambda resource configuration
            const lamdaResource = resourceNodes[0] as ResourceNode
            assert.strictEqual(lamdaResource.resource.resource.Type, 'AWS::Serverless::Function')
            assert.strictEqual(lamdaResource.resource.resource.Runtime, 'dotnet8')
            assert.strictEqual(lamdaResource.resource.resource.Id, 'HelloWorldFunction')
            assert.deepStrictEqual(lamdaResource.resource.resource.Events, [
                {
                    Id: 'HelloWorld',
                    Type: 'Api',
                    Path: '/hello',
                    Method: 'get',
                },
            ])
            assert.deepStrictEqual(lamdaResource.resource.resource.Environment, {
                Variables: {
                    PARAM1: 'VALUE',
                },
            })

            prompterTester.assertCallAll()
        })
    })
})
