/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import assert from 'assert'
import * as sinon from 'sinon'
import { Commands } from '../../../../../shared/vscode/commands2'
import * as Telemetry from '../../../../../shared/telemetry/telemetry'
import * as VsCodeUtils from '../../../../../shared/utilities/vsCodeUtils'
import * as DetectSamProjects from '../../../../../../src/awsService/appBuilder/explorer/detectSamProjects'
import globals from '../../../../../shared/extensionGlobals'

import { AppBuilderRootNode, getAppNodes } from '../../../../../awsService/appBuilder/explorer/nodes/rootNode'

import { AppNode } from '../../../../../awsService/appBuilder/explorer/nodes/appNode'

describe('getAppNodes', async () => {
    let sandbox: sinon.SinonSandbox
    let detectSamProjectsStub: sinon.SinonStub

    beforeEach(() => {
        sandbox = sinon.createSandbox()
        // Use sandbox.stub instead of sinon.stub
        detectSamProjectsStub = sandbox.stub(DetectSamProjects, 'detectSamProjects')
    })

    afterEach(() => {
        sandbox.restore()
    })

    it('should return an placeholder item when no SAM projects are found', async () => {
        detectSamProjectsStub.resolves([])
        const appNodes = await getAppNodes()
        assert.strictEqual(appNodes.length, 1)
        assert.strictEqual(appNodes[0].id, 'placeholder')
        assert.strictEqual(appNodes[0].resource, '[No IaC templates found in Workspaces]')
    })

    it('should return all SAM projects as AppNode', async () => {
        const mockProjects = createMockProject(5)
        detectSamProjectsStub.resolves(mockProjects)
        const appNodes = await getAppNodes()
        assert.strictEqual(appNodes.length, mockProjects.length)
        assert(appNodes.every((node) => node instanceof AppNode))
    })
})

describe('AppBuilderRootNode', () => {
    let commandRegisterStub: sinon.SinonStub
    let openUrlStub: sinon.SinonStub
    let telemetryStub: sinon.SinonStub
    let rootNode: AppBuilderRootNode
    let sandbox: sinon.SinonSandbox
    let detectSamProjectsStub: sinon.SinonStub

    beforeEach(() => {
        sandbox = sinon.createSandbox()
        // Use sandbox.stub instead of sinon.stub
        detectSamProjectsStub = sandbox.stub(DetectSamProjects, 'detectSamProjects')
        // Stub the Commands.register method
        commandRegisterStub = sandbox.stub(Commands, 'register')
        // Stub the openUrl function
        openUrlStub = sandbox.stub(VsCodeUtils, 'openUrl')
        // Stub the telemetry.aws_help.emit method
        telemetryStub = sandbox.stub(Telemetry, 'telemetry')
        rootNode = new AppBuilderRootNode()
    })

    afterEach(() => {
        sandbox.restore()
    })

    describe('constructor', () => {
        it('should create an AppBuilderRootNode with correct properties', () => {
            assert.strictEqual(rootNode.id, 'appBuilder')
            assert.strictEqual(rootNode.resource, rootNode)
        })

        it('should register commands correctly', () => {
            assert.strictEqual(commandRegisterStub.callCount, 1)
            assert.strictEqual(commandRegisterStub.firstCall.args[0], 'aws.appBuilder.viewDocs')

            // Helper functions that used for registering never get called
            assert.strictEqual(openUrlStub.callCount, 0)
            assert.strictEqual(telemetryStub.callCount, 0)
            // Check that the refresh function is set correctly during instantiation
            assert.strictEqual(typeof rootNode.refreshAppBuilderExplorer, 'function')
            assert.strictEqual(typeof rootNode.refreshAppBuilderForFileExplorer, 'function')
        })
    })

    describe('getChildren', () => {
        const mockProjects = createMockProject(5)

        beforeEach(() => {
            // Stub detectSamProjectsStub() to return 5 projects
            detectSamProjectsStub.resolves(mockProjects)
        })

        it('should generate all child  project nodes wihtouth walkthrough when walkthrogh is completed', async () => {
            // Set walk throught status to false
            const walkThroughState = await globals.globalState.get('aws.toolkit.lambda.walkthroughCompleted')
            await globals.globalState.update('aws.toolkit.lambda.walkthroughCompleted', true)

            const childrenAppNodes = await rootNode.getChildren()

            assert.strictEqual(childrenAppNodes.length, mockProjects.length)
            // Set walk throught status to original state
            await globals.globalState.update('aws.toolkit.lambda.walkthroughCompleted', walkThroughState)
        })

        it('should generate all child  project nodes + walkthrough node when walkthrogh is incomplete', async () => {
            // Set walk throught status to false
            const walkThroughState = await globals.globalState.get('aws.toolkit.lambda.walkthroughCompleted')
            await globals.globalState.update('aws.toolkit.lambda.walkthroughCompleted', false)

            const childrenAppNodes = await rootNode.getChildren()

            const walkThroughNode = childrenAppNodes[0]
            assert.strictEqual(walkThroughNode.id, 'walkthrough')
            assert.strictEqual(childrenAppNodes.filter((node) => node instanceof AppNode).length, mockProjects.length)

            // Set walk throught status to original state
            await globals.globalState.update('aws.toolkit.lambda.walkthroughCompleted', walkThroughState)
        })
    })

    describe('getTreeItem', () => {
        it('should generate correct TreeItem for AppBuilderRootNode', () => {
            const rootNode = AppBuilderRootNode.instance
            const treeItem = rootNode.getTreeItem()

            assert.strictEqual(treeItem.label, 'APPLICATION BUILDER')
            assert.strictEqual(treeItem.collapsibleState, vscode.TreeItemCollapsibleState.Collapsed)
            assert.strictEqual(treeItem.contextValue, 'awsAppBuilderRootNode')
        })
    })
})

function createMockProject(count: number) {
    return Array.from({ length: count }, (_, i) => ({
        samTemplateUri: vscode.Uri.parse(`/Mock Workspace/Mock Project ${i + 1}/template.yaml`),
        workspaceFolder: {
            uri: vscode.Uri.parse('/Mock Workspace'),
            name: 'Mock Workspace',
            index: 0,
        },
        projectRoot: vscode.Uri.parse(`/Mock Workspace/Mock Project ${i + 1}`),
        projectName: `Mock Project ${i + 1}`,
        projectIndex: i,
    }))
}
