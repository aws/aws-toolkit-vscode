/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as vscode from 'vscode'
import path from 'path'
import { PrompterTester } from '../../../../test/shared/wizards/prompterTester'
import { describe } from 'mocha'
import { ProjectMetadata } from '../../../../awsService/appBuilder/serverlessLand/metadataManager'
import * as nodefs from 'fs' // eslint-disable-line no-restricted-imports
import fs from '../../../../shared/fs/fs'
import globals from '../../../../shared/extensionGlobals'
import { AppBuilderRootNode } from '../../../../awsService/appBuilder/explorer/nodes/rootNode'
import * as sinon from 'sinon'
import { AppNode } from '../../../../awsService/appBuilder/explorer/nodes/appNode'
import { ResourceNode } from '../../../../awsService/appBuilder/explorer/nodes/resourceNode'
import { getTestWindow } from '../../../../test/shared/vscode/window'

describe('CreateWizard', async () => {
    const metadataPath = globals.context.asAbsolutePath(path.join('dist', 'src', 'serverlessLand', 'metadata.json'))
    const metadataContent = nodefs.readFileSync(metadataPath, { encoding: 'utf-8' })
    const parseMetadata = JSON.parse(metadataContent) as ProjectMetadata
    const workspaceFolder = vscode.workspace.workspaceFolders![0]
    const projectFolder = 'my-project-from-Serverless-Land'
    let rootNode: sinon.SinonSpiedInstance<AppBuilderRootNode>
    let sandbox: sinon.SinonSandbox

    beforeEach(async () => {
        sandbox = sinon.createSandbox()
        await fs.delete(path.join(workspaceFolder.uri.fsPath, projectFolder), { recursive: true })
    })

    afterEach(async () => {
        await fs.delete(path.join(workspaceFolder.uri.fsPath, projectFolder), { recursive: true })
        sandbox.restore()
    })

    describe(':) ServerlessLand Path', async () => {
        it('creates project with Python runtime and CDK', async () => {
            rootNode = sandbox.spy(AppBuilderRootNode.instance)
            const testWindow = getTestWindow()
            const prompterTester = PrompterTester.init({ testWindow })
                .handleQuickPick('Select a Pattern for your application', async (quickPick) => {
                    await quickPick.untilReady()
                    const options = quickPick.items
                    Object.entries(parseMetadata.patterns).map(([key, pattern]) => {
                        options.find((option) => option.label === key && option.detail === pattern.description)
                    })
                    assert.strictEqual(options[0].label, 'Image Resizing')
                    quickPick.acceptItem(quickPick.items[0])
                })
                .handleQuickPick('Select Runtime', async (quickPick) => {
                    await quickPick.untilReady()
                    quickPick.acceptItem(quickPick.items[0]) // python
                })
                .handleQuickPick('Select IaC', async (quickPick) => {
                    await quickPick.untilReady()
                    const options = quickPick.items
                    quickPick.acceptItem(options[0]) // sam
                })
                .handleQuickPick('Select Project Location', async (quickPick) => {
                    await quickPick.untilReady()
                    quickPick.acceptItem(quickPick.items[0])
                })
                .handleInputBox('Enter Project Name', (inputBox) => {
                    inputBox.acceptValue('python-sam-project')
                })
                .build()

            await vscode.commands.executeCommand('aws.toolkit.lambda.createServerlessLandProject')

            const projectNode = await rootNode
                .getChildren()
                .then(
                    (children) =>
                        children.find(
                            (node) =>
                                node instanceof AppNode &&
                                node.label === path.normalize('workspaceFolder/python-sam-project')
                        ) as AppNode | undefined
                )

            assert.ok(projectNode)
            const resourceNodes = await projectNode.getChildren()
            assert.strictEqual(resourceNodes.length, 3)
            assert.ok(resourceNodes[0] instanceof ResourceNode)

            const lambdaResource = resourceNodes[2] as ResourceNode
            assert.strictEqual(lambdaResource.resource.resource.Runtime, 'python3.12')

            prompterTester.assertCallAll()
        })
    })
    describe('Error Handling', async () => {
        it('handles empty project name', async () => {
            const testWindow = getTestWindow()
            const prompterTester = PrompterTester.init({ testWindow })
                .handleQuickPick('Select a Pattern for your application', async (quickPick) => {
                    await quickPick.untilReady()
                    quickPick.acceptItem(quickPick.items[1])
                })
                .handleQuickPick('Select Runtime', async (quickPick) => {
                    await quickPick.untilReady()
                    quickPick.acceptItem(quickPick.items[3])
                })
                .handleQuickPick('Select IaC', async (quickPick) => {
                    await quickPick.untilReady()
                    quickPick.acceptItem(quickPick.items[0])
                })
                .handleQuickPick('Select Project Location', async (quickPick) => {
                    await quickPick.untilReady()
                    quickPick.acceptItem(quickPick.items[0])
                })
                .handleInputBox('Enter Project Name', (inputBox) => {
                    inputBox.acceptValue(' ')
                })
                .build()

            try {
                await vscode.commands.executeCommand('aws.toolkit.lambda.createServerlessLandProject')
                assert.fail('Project name cannot be empty')
            } catch (err) {
                assert.ok(err instanceof Error)
                assert.strictEqual(err.message, 'Project name cannot be empty')
            }

            prompterTester.assertCallAll()
        })
    })
})
