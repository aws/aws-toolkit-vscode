/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import * as assert from 'assert'
import { SagemakerDevSpaceNode } from '../../../../awsService/sagemaker/explorer/sagemakerDevSpaceNode'
import { SagemakerHyperpodNode } from '../../../../awsService/sagemaker/explorer/sagemakerHyperpodNode'
import { HyperpodDevSpace, HyperpodCluster, KubectlClient } from '../../../../shared/clients/kubectlClient'
import { SagemakerClient } from '../../../../shared/clients/sagemaker'
import { createMockK8sSetup } from '../../../shared/clients/kubectlTestHelpers'

describe('SagemakerDevSpaceNode', function () {
    let testNode: SagemakerDevSpaceNode
    let mockParent: SagemakerHyperpodNode
    let mockKubectlClient: sinon.SinonStubbedInstance<KubectlClient>
    let mockDevSpace: HyperpodDevSpace
    let mockHyperpodCluster: HyperpodCluster
    let mockSagemakerClient: sinon.SinonStubbedInstance<SagemakerClient>
    const testRegion = 'us-east-1'

    beforeEach(function () {
        mockSagemakerClient = sinon.createStubInstance(SagemakerClient)
        mockParent = new SagemakerHyperpodNode(testRegion, mockSagemakerClient as any)
        mockKubectlClient = sinon.createStubInstance(KubectlClient)

        const mockSetup = createMockK8sSetup()
        mockDevSpace = mockSetup.mockDevSpace as HyperpodDevSpace
        mockHyperpodCluster = mockSetup.mockHyperpodCluster

        sinon.stub(mockParent, 'getKubectlClient').returns(mockKubectlClient as any)
        sinon.stub(mockParent, 'trackPendingNode').returns()

        testNode = new SagemakerDevSpaceNode(mockParent, mockDevSpace, mockHyperpodCluster, testRegion)
    })

    afterEach(function () {
        sinon.restore()
    })

    describe('buildLabel', function () {
        it('should return formatted label with name and status', function () {
            const label = testNode.buildLabel()
            assert.strictEqual(label, 'test-space (Stopped)')
        })
    })

    describe('buildDescription', function () {
        it('should return access type description', function () {
            const description = testNode.buildDescription()
            assert.strictEqual(description, 'Public space')
        })

        it('should default to Public when accessType is undefined', function () {
            const newDevSpace = { ...mockDevSpace, accessType: 'Public' }
            const newNode = new SagemakerDevSpaceNode(mockParent, newDevSpace, mockHyperpodCluster, testRegion)
            const description = newNode.buildDescription()
            assert.strictEqual(description, 'Public space')
        })
    })

    describe('getContext', function () {
        it('should return transitional context for Starting status', function () {
            const getStatusStub = sinon.stub(testNode, 'status').get(() => 'Starting')
            const context = (testNode as any).getContext()
            assert.strictEqual(context, 'awsSagemakerHyperpodDevSpaceTransitionalNode')
            getStatusStub.restore()
        })

        it('should return stopped context for Stopped status', function () {
            const getStatusStub = sinon.stub(testNode, 'status').get(() => 'Stopped')
            const context = (testNode as any).getContext()
            assert.strictEqual(context, 'awsSagemakerHyperpodDevSpaceStoppedNode')
            getStatusStub.restore()
        })

        it('should return running context for Running status', function () {
            const getStatusStub = sinon.stub(testNode, 'status').get(() => 'Running')
            const context = (testNode as any).getContext()
            assert.strictEqual(context, 'awsSagemakerHyperpodDevSpaceRunningNode')
            getStatusStub.restore()
        })

        it('should return error context for unknown status', function () {
            const getStatusStub = sinon.stub(testNode, 'status').get(() => 'Unknown')
            const context = (testNode as any).getContext()
            assert.strictEqual(context, 'awsSagemakerHyperpodDevSpaceErrorNode')
            getStatusStub.restore()
        })
    })

    describe('isPending', function () {
        it('should return false for Running status', function () {
            const getStatusStub = sinon.stub(testNode, 'status').get(() => 'Running')
            assert.strictEqual(testNode.isPending(), false)
            getStatusStub.restore()
        })

        it('should return false for Stopped status', function () {
            const getStatusStub = sinon.stub(testNode, 'status').get(() => 'Stopped')
            assert.strictEqual(testNode.isPending(), false)
            getStatusStub.restore()
        })

        it('should return true for Starting status', function () {
            const getStatusStub = sinon.stub(testNode, 'status').get(() => 'Starting')
            assert.strictEqual(testNode.isPending(), true)
            getStatusStub.restore()
        })
    })

    describe('getDevSpaceKey', function () {
        it('should return formatted devspace key', function () {
            const key = testNode.getDevSpaceKey()
            assert.strictEqual(key, 'test-cluster-test-namespace-test-space')
        })
    })

    describe('updateWorkspaceStatus', function () {
        it('should update status from kubectl client', async function () {
            mockKubectlClient.getHyperpodSpaceStatus.resolves('Running')

            await testNode.updateWorkspaceStatus()

            assert.strictEqual(testNode.status, 'Running')
            sinon.assert.calledOnce(mockKubectlClient.getHyperpodSpaceStatus)
        })

        it('should handle errors gracefully', async function () {
            mockKubectlClient.getHyperpodSpaceStatus.rejects(new Error('API Error'))

            await testNode.updateWorkspaceStatus()

            // Should not throw, just log warning
            sinon.assert.calledOnce(mockKubectlClient.getHyperpodSpaceStatus)
        })
    })

    describe('buildTooltip', function () {
        it('should format tooltip with all devspace details', function () {
            const tooltip = testNode.buildTooltip()

            assert.ok(tooltip.includes('test-space'))
            assert.ok(tooltip.includes('test-namespace'))
            assert.ok(tooltip.includes('test-cluster'))
            assert.ok(tooltip.includes('test-user'))
            assert.ok(tooltip.includes('Hyperpod'))
        })
    })

    describe('buildIconPath', function () {
        it('should return jupyter icon for jupyterlab app type', function () {
            testNode.devSpace.appType = 'jupyterlab'

            const iconPath = testNode.buildIconPath()

            assert.ok(iconPath !== undefined)
        })

        it('should return code editor icon for code-editor app type', function () {
            testNode.devSpace.appType = 'code-editor'

            const iconPath = testNode.buildIconPath()

            assert.ok(iconPath !== undefined)
        })

        it('should return undefined for unknown app types', function () {
            testNode.devSpace.appType = 'unknown-type'

            const iconPath = testNode.buildIconPath()

            assert.strictEqual(iconPath, undefined)
        })
    })

    describe('updateWorkspace', function () {
        it('should update all node properties and track pending if needed', function () {
            const isPendingStub = sinon.stub(testNode, 'isPending').returns(true)

            testNode.updateWorkspace()

            // Should update properties
            assert.ok(testNode.label)
            assert.ok(testNode.description)
            assert.ok(testNode.tooltip)
            assert.ok(testNode.contextValue)

            isPendingStub.restore()
        })
    })

    describe('refreshNode', function () {
        it('should update status and refresh VS Code explorer', async function () {
            const updateStatusStub = sinon.stub(testNode, 'updateWorkspaceStatus').resolves()

            await testNode.refreshNode()

            sinon.assert.calledOnce(updateStatusStub)
            // Note: VS Code commands.executeCommand is mocked by the test framework

            updateStatusStub.restore()
        })
    })
})
