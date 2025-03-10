/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as vscode from 'vscode'
import { AppBuilderRootNode } from '../../../awsService/appBuilder/explorer/nodes/rootNode'
import { detectSamProjects } from '../../../awsService/appBuilder/explorer/detectSamProjects'
import { SamAppLocation } from '../../../awsService/appBuilder/explorer/samProject'
import { AppNode } from '../../../awsService/appBuilder/explorer/nodes/appNode'
import { ResourceNode } from '../../../awsService/appBuilder/explorer/nodes/resourceNode'
import * as sinon from 'sinon'
import { writeSamconfigGlobal, SamConfig } from '../../../shared/sam/config'
import { globals, sleep } from '../../../shared'
import path from 'path'

describe('Application Builder', async () => {
    let rootNode: sinon.SinonSpiedInstance<AppBuilderRootNode>
    let projects: SamAppLocation[]
    let originalWalkThroughState: boolean
    let projectNodes: any[]
    let sandbox: sinon.SinonSandbox

    before(async () => {
        sandbox = sinon.createSandbox()
        // Set the workspace to the testFixtures folder to avoid side effects from other tests.
        sandbox.stub(vscode.workspace, 'workspaceFolders').value([
            {
                index: 0,
                name: 'workspaceFolder',
                uri: vscode.Uri.file(path.join(__dirname, '../../../../src/testFixtures/workspaceFolder')),
            },
        ])
        rootNode = sandbox.spy(AppBuilderRootNode.instance)

        projects = await detectSamProjects()

        // Set the walkthrough status to true to ensure the root node has a walkthrough node
        originalWalkThroughState = (await globals.globalState.get('aws.toolkit.lambda.walkthroughCompleted')) || false
        await globals.globalState.update('aws.toolkit.lambda.walkthroughCompleted', false)
    })

    after(async () => {
        // Restore original status of walkthroughCompleted status
        await globals.globalState.update('aws.toolkit.lambda.walkthroughCompleted', originalWalkThroughState)
        sandbox.restore()
    })

    describe('root node', async () => {
        it('creates an AppBuilderRootNode with correct label', async () => {
            const appBuidlerNode = rootNode.getTreeItem()
            assert.strictEqual(appBuidlerNode.label, 'APPLICATION BUILDER')
        })

        it('generates correct number of children nodes: walkthrough node + project nodes', async () => {
            const rootNodeChildern = await rootNode.getChildren()

            // walkthrough node should be at the first position in the list
            const walkthroughNode = rootNodeChildern[0]
            assert.strictEqual(walkthroughNode.id, 'walkthrough')

            // project nodes in the workspace should be AppNode instances for all project in the workspace
            projectNodes = rootNodeChildern.filter((node) => node instanceof AppNode)
            assert.strictEqual(projectNodes.length, projects.length)
        })
    })

    describe('application nodes in workspace (Test in order)', async () => {
        // The following `it()` statement within this block is meant to be executed in order
        let appBuilderTestApp: AppNode
        let appBuilderTestAppResourceNodes
        let samConfig: SamConfig
        let projectRoot: vscode.Uri

        it('1: contains application node for appbuilder-test-app', async () => {
            // projectNodes set from previous step
            const filterResult = projectNodes.filter(
                (node): node is AppNode =>
                    node instanceof AppNode && node.label === 'workspaceFolder/appbuilder-test-app'
            )
            assert.strictEqual(filterResult.length, 1)

            // Set properties for succeeding tests
            appBuilderTestApp = filterResult[0]
            projectRoot = appBuilderTestApp.resource.projectRoot
            samConfig = await SamConfig.fromProjectRoot(projectRoot)
        })

        it('2: contains correct application node properties', async () => {
            // Validate App Node
            const appBuilderTestAppTreeItem = appBuilderTestApp.getTreeItem()
            assert.strictEqual(appBuilderTestAppTreeItem.collapsibleState, vscode.TreeItemCollapsibleState.Collapsed)
            assert(appBuilderTestAppTreeItem.label, 'workspaceFolder/appbuilder-test-app')
            assert(appBuilderTestAppTreeItem.contextValue, 'awsAppBuilderAppNode')
        })

        it('3: contains correct resource node properties', async () => {
            // Validate Resource Node
            appBuilderTestAppResourceNodes = await appBuilderTestApp.getChildren()

            // Expect 4 undeployed resources in this example projects
            assert(appBuilderTestAppResourceNodes.length === 4)
            assert(appBuilderTestAppResourceNodes.every((resourceNode) => resourceNode instanceof ResourceNode))

            assert(
                appBuilderTestAppResourceNodes.every(
                    (resourceNode): resourceNode is ResourceNode => resourceNode instanceof ResourceNode
                )
            )

            const expectedStackName = await samConfig.getCommandParam('global', 'stack_name')
            const expectedRegion = await samConfig.getCommandParam('global', 'region')
            for (const node of appBuilderTestAppResourceNodes) {
                if (node instanceof ResourceNode) {
                    assert.strictEqual(node.resource.region, expectedRegion)
                    assert.strictEqual(node.resource.stackName, expectedStackName)
                    assert(!node.resource.deployedResource)
                    assert(!node.resourceLogicalId)
                } else {
                    assert.fail('Node is not an instance of ResourceNode')
                }
            }

            // Validate Lambda resource node
            const lambdaResourceNode = getResourceNodeByType(
                appBuilderTestAppResourceNodes,
                'AWS::Serverless::Function'
            )
            assert.strictEqual(lambdaResourceNode.id, 'AppBuilderProjectLambda')
            const lambdaTreeItemProperties = lambdaResourceNode.getTreeItem()
            assert.strictEqual(lambdaTreeItemProperties.collapsibleState, vscode.TreeItemCollapsibleState.None)
            assert.strictEqual(lambdaTreeItemProperties.iconPath?.toString(), '$(aws-lambda-function)')

            // Validate s3 bucket
            const s3BucketResourceNode = getResourceNodeByType(appBuilderTestAppResourceNodes, 'AWS::S3::Bucket')
            assert.strictEqual(s3BucketResourceNode.id, 'AppBuilderProjectBucket')
            const s3BucketTreeItemProperties = s3BucketResourceNode.getTreeItem()
            assert.strictEqual(s3BucketTreeItemProperties.collapsibleState, vscode.TreeItemCollapsibleState.None)
            assert.strictEqual(s3BucketTreeItemProperties.iconPath?.toString(), '$(aws-s3-bucket)')

            // Validate s3 policy
            const s3PolicyResourceNode = getResourceNodeByType(appBuilderTestAppResourceNodes, 'AWS::S3::BucketPolicy')
            assert.strictEqual(s3PolicyResourceNode.id, 'AppBuilderProjectBucketBucketPolicy')
            const s3PolicyTreeItemProperties = s3PolicyResourceNode.getTreeItem()
            assert.strictEqual(s3PolicyTreeItemProperties.collapsibleState, vscode.TreeItemCollapsibleState.None)
            assert.strictEqual(s3PolicyTreeItemProperties.iconPath?.toString(), '$(info)')

            // Validate api gateway resource node
            const apigwResourceNode = getResourceNodeByType(appBuilderTestAppResourceNodes, 'AWS::Serverless::Api')
            assert.strictEqual(apigwResourceNode.id, 'AppBuilderProjectAPI')
            const apigwTreeItemProperties = apigwResourceNode.getTreeItem()
            assert.strictEqual(apigwTreeItemProperties.collapsibleState, vscode.TreeItemCollapsibleState.None)
            assert.strictEqual(apigwTreeItemProperties.iconPath?.toString(), '$(info)')
        })

        it('4: has registered refresh command successfully', async () => {
            const originalCount = rootNode.refresh.callCount
            let accumulateCount: number

            await vscode.commands.executeCommand('aws.appBuilderForFileExplorer.refresh')
            accumulateCount = rootNode.refresh.callCount
            assert.strictEqual(accumulateCount - originalCount, 1)

            await vscode.commands.executeCommand('aws.appBuilder.refresh')
            accumulateCount = rootNode.refresh.callCount
            assert.strictEqual(accumulateCount - originalCount, 2)
        })

        it('5: triggers auto refresh when there a file getting updated', async () => {
            // Get existing stack name and region information
            const orignalStackName = `${await samConfig.getCommandParam('global', 'stack_name')}`
            const originalRegion = `${await samConfig.getCommandParam('global', 'region')}`
            const updateStackName = `${orignalStackName}-updated`
            const originalCount = rootNode.refresh.callCount

            // Update stack name in samconfig.toml
            await writeSamconfigGlobal(projectRoot, updateStackName, originalRegion)
            await sleep(500)
            const accumulateCount = rootNode.refresh.callCount
            assert.strictEqual(accumulateCount - originalCount, 2)

            // Restore region  to us-west-2
            await writeSamconfigGlobal(projectRoot, orignalStackName, originalRegion)
        })
    })
})

function getResourceNodeByType(resourceNodes: any[], type: string) {
    const matches = resourceNodes.filter((node) => node.resource.resource.Type === type)
    // Expect only 1 resource node per resource type specifically for this appbuilder-test-app
    assert(matches.length === 1)
    return matches[0]
}
