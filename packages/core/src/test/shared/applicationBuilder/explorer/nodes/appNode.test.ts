/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import assert from 'assert'
import { AppNode } from '../../../../../awsService/appBuilder/explorer/nodes/appNode'
import * as SamProjectModule from '../../../../../awsService/appBuilder/explorer/samProject'
import * as ListSamResourcesModule from '../../../../../lambda/commands/listSamResources'
import * as ResourceNodeModule from '../../../../../awsService/appBuilder/explorer/nodes/resourceNode'
import * as DeployedStackModule from '../../../../../awsService/appBuilder/explorer/nodes/deployedStack'
import sinon from 'sinon'
import path from 'path'

import { isTreeNode, TreeNode } from '../../../../../shared/treeview/resourceTreeDataProvider'

describe('AppNode', () => {
    let sandbox: sinon.SinonSandbox
    let appNode: AppNode

    // Create a mock samAppLocation object
    const expectedWorkspaceFolder = {
        uri: vscode.Uri.parse('/VSCode Example Workspace'),
        name: 'VSCode Example Workspace',
        index: 0,
    }
    const expectProjectRoot = vscode.Uri.parse('/VSCode Example Workspace/Project One Root Folder')
    const expectedSamTemplateUri = vscode.Uri.parse('/VSCode Example Workspace/Project One Root Folder/template.yaml')
    const expectedSamAppLocation = {
        workspaceFolder: expectedWorkspaceFolder,
        samTemplateUri: expectedSamTemplateUri,
        projectRoot: expectProjectRoot,
    }

    beforeEach(function () {
        // create sandbox
        sandbox = sinon.createSandbox()
        // Instantiate class
        appNode = new AppNode(expectedSamAppLocation)
    })

    afterEach(function () {
        // Restore the stubs after each test
        sandbox.restore()
    })

    describe('constructor', () => {
        it('should create a new AppNode instance', () => {
            assert.strictEqual(appNode instanceof AppNode, true)
        })

        it('should set correct properties', () => {
            assert.strictEqual(appNode.id, mockSamAppLocationResponse.samTemplateUri.toString())
            assert.strictEqual(appNode.resource, expectedSamAppLocation)
            assert.strictEqual(appNode.label, path.join('VSCode Example Workspace', 'Project One Root Folder'))
        })
    })

    describe('getChildren', () => {
        let getAppStub: sinon.SinonStub
        let getStackNameStub: sinon.SinonStub
        let generateStackNodeStub: sinon.SinonStub
        let getDeployedResourcesStub: sinon.SinonStub
        let generateResourceNodesStub: sinon.SinonStub

        beforeEach(() => {
            // Create a stub for helper functions used in getChildren() to call real method if not override in each test
            getAppStub = sandbox.stub(SamProjectModule, 'getApp')
            getStackNameStub = sandbox.stub(SamProjectModule, 'getStackName')
            generateStackNodeStub = sandbox.stub(DeployedStackModule, 'generateStackNode')
            getDeployedResourcesStub = sandbox.stub(ListSamResourcesModule, 'getDeployedResources')
            generateResourceNodesStub = sandbox.stub(ResourceNodeModule, 'generateResourceNodes')
        })

        it('should return placeholder item for an empty App', async () => {
            // stub getApp() and return mock response
            getAppStub.resolves(mockGetAppResponse)
            // stub getStackName() and return mock response
            getStackNameStub.resolves(mockGetStackNameResponse)
            // stub generateStackNode() and return []
            generateStackNodeStub.resolves([])
            // stub getDeployedResources() and return []
            getDeployedResourcesStub.resolves([])
            // stub  generateResourceNodes to return empty array simulate empty application
            generateResourceNodesStub.returns([])

            const resources = await appNode.getChildren()
            assert.strictEqual(resources.length, 1)
            assert(isTreeNode(resources[0]))

            const resourceNode = resources[0] as TreeNode
            assert.strictEqual(resourceNode.id, 'placeholder')
            assert.strictEqual(resourceNode.resource, '[No IaC templates found in Workspaces]')
            assert(getAppStub.calledOnce)
            assert(getStackNameStub.calledOnce)
            assert(generateStackNodeStub.notCalled)
            assert(getDeployedResourcesStub.calledOnce)
            assert(generateResourceNodesStub.calledOnce)
        })

        it('should return resource without deploy stack name node', async () => {
            // stub getApp() and return mock response
            getAppStub.resolves(mockGetAppResponse)
            // stub getStackName() and return undefined stackName and region simulate undeployed stack
            getStackNameStub.resolves({ stackName: undefined, region: undefined })
            // call actual method
            generateResourceNodesStub.callThrough()

            const resources = await appNode.getChildren()
            assert.strictEqual(resources.length, 1)
            assert.strictEqual(resources[0].id, 'MyProjectLambdaFunction')
            assert(getAppStub.calledOnce)
            assert(getStackNameStub.calledOnce)
            assert(generateStackNodeStub.notCalled)
            assert(getDeployedResourcesStub.notCalled)
            assert(generateResourceNodesStub.calledOnce)
        })

        it('should return resource with all deployed nodes when stack is deployed', async () => {
            // stub getApp() and return mock response
            getAppStub.resolves(mockGetAppResponse)
            // stub getStackName() and return stack name and region
            getStackNameStub.resolves(mockGetStackNameResponse)
            // stub generateStackNode() and return mock response
            generateStackNodeStub.resolves(mockGenerateStackNodeResponse)
            // stub getDeployedResources() and return mock response
            getDeployedResourcesStub.resolves(mockDeployedResourcesResponse)
            // call actual method
            generateResourceNodesStub.callThrough()

            const resources = await appNode.getChildren()
            assert.strictEqual(resources.length, 2)
            assert(
                resources.some((node) => node.id === 'MyProjectLambdaFunction'),
                'Missing expected  childern node: MyProjectLambdaFunction'
            )
            assert(
                resources.some((node) => node.id === 'my-project-one-stack-name'),
                'Missing expected  childern node: my-project-one-stack-name'
            )
            assert(getAppStub.calledOnce)
            assert(getStackNameStub.calledOnce)
            assert(generateStackNodeStub.calledOnce)
            assert(getDeployedResourcesStub.calledOnce)
            assert(generateResourceNodesStub.calledOnce)
        })

        it('should return placeholder item when encounter error', async () => {
            // stub getApp() and throw error
            getAppStub.rejects(new Error('Mock error'))

            const resources = await appNode.getChildren()
            assert.strictEqual(resources.length, 1)
            assert(isTreeNode(resources[0]))

            const resourceNode = resources[0] as TreeNode
            assert.strictEqual(resourceNode.id, 'placeholder')
            assert.strictEqual(
                resourceNode.resource,
                '[Unable to load Resource tree for this App. Update IaC template]'
            )
            assert(getAppStub.calledOnce)
            assert(getStackNameStub.notCalled)
            assert(generateStackNodeStub.notCalled)
            assert(getDeployedResourcesStub.notCalled)
            assert(generateResourceNodesStub.notCalled)
        })
    })

    describe('getTreeItem', () => {
        it('should return a TreeItem with the correct properties', () => {
            const treeItem = appNode.getTreeItem()
            const expextedLabel = path.join('VSCode Example Workspace', 'Project One Root Folder')

            assert.strictEqual(treeItem.label, expextedLabel)
            assert.strictEqual(treeItem.contextValue, 'awsAppBuilderAppNode')
            assert.strictEqual(treeItem.collapsibleState, vscode.TreeItemCollapsibleState.Collapsed)
            assert.deepStrictEqual(treeItem.resourceUri, expectedSamTemplateUri)
            assert.strictEqual(treeItem.tooltip, expectedSamTemplateUri.path)
        })
    })
})

const mockGetStackNameResponse = {
    stackName: 'my-project-one-stack-name',
    region: 'us-east-1',
}

const mockGenerateStackNodeResponse = [
    {
        stackName: 'my-project-one-stack-name',
        regionCode: 'us-east-1',
        id: 'my-project-one-stack-name',
    },
]

const mockSamAppLocationResponse = {
    samTemplateUri: vscode.Uri.file(path.join('VSCode Example Workspace', 'Project One Root Folder', 'template.yaml')),
    workspaceFolder: {
        uri: vscode.Uri.file(path.join('VSCode Example Workspace')),
        name: 'VSCode Example Workspace',
        index: 0,
    },
    projectRoot: vscode.Uri.file(path.join('VSCode Example Workspace', 'Project One Root Folder')),
}
const mockResourceTreeEntity = {
    Id: 'MyProjectLambdaFunction',
    Type: 'AWS::Serverless::Function',
    Runtime: 'python3.12',
    Handler: 'app.lambda_handler',
    Events: [
        {
            Id: 'MyProjectLambda',
            Type: 'Api',
            Path: '/hello',
            Method: 'get',
        },
    ],
}

const mockGetAppResponse = {
    location: mockSamAppLocationResponse,
    resourceTree: [mockResourceTreeEntity],
}

const mockDeployedResourcesResponse = [
    {
        LogicalResourceId: 'MyProjectLambdaFunctionRole',
        PhysicalResourceId: 'my-project-one-stack-name-MyProjectLambdaFunctionRo-uvrNoVPn4YWa',
    },
    {
        LogicalResourceId: 'MyProjectLambdaFunction',
        PhysicalResourceId: '-',
    },
    {
        LogicalResourceId: 'MyProjectLambdaFunctionMyProjectLambdaPermissionProd',
        PhysicalResourceId: '-',
    },
    {
        LogicalResourceId: 'ServerlessRestApi',
        PhysicalResourceId: '-',
    },
    {
        LogicalResourceId: 'ServerlessRestApiDeploymenteba9892cd9',
        PhysicalResourceId: '-',
    },
    {
        LogicalResourceId: 'ServerlessRestApiProdStage',
        PhysicalResourceId: '-',
    },
]
