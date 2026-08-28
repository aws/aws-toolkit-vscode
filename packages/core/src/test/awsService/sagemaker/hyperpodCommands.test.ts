/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import * as assert from 'assert'
import { SagemakerDevSpaceNode } from '../../../awsService/sagemaker/explorer/sagemakerDevSpaceNode'
import { SagemakerHyperpodNode } from '../../../awsService/sagemaker/explorer/sagemakerHyperpodNode'
import { startHyperpodSpaceCommand, stopHyperPodSpaceCommand } from '../../../awsService/sagemaker/hyperpodCommands'
import * as messages from '../../../shared/utilities/messages'
import { createMockK8sSetup } from '../../shared/clients/kubectlTestHelpers'
import { HyperpodDevSpace, HyperpodCluster } from '../../../awsService/sagemaker/detached-server/hyperpodTypes'
import { KubectlClient } from '../../../shared/clients/kubectlClient'
import { SagemakerClient } from '../../../shared/clients/sagemaker'

describe('hyperpodCommands', function () {
    let sandbox: sinon.SinonSandbox
    let mockNode: SagemakerDevSpaceNode
    let mockParent: SagemakerHyperpodNode
    let mockKubectlClient: sinon.SinonStubbedInstance<KubectlClient>
    let mockDevSpace: HyperpodDevSpace
    let mockHyperpodCluster: HyperpodCluster

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        const mockSagemakerClient = sandbox.createStubInstance(SagemakerClient)
        mockParent = new SagemakerHyperpodNode('us-east-1', mockSagemakerClient as any)
        mockKubectlClient = sandbox.createStubInstance(KubectlClient)

        const mockSetup = createMockK8sSetup()
        mockDevSpace = { ...mockSetup.mockDevSpace }
        mockHyperpodCluster = mockSetup.mockHyperpodCluster

        sandbox.stub(mockParent, 'getKubectlClient').returns(mockKubectlClient as any)
        sandbox.stub(mockParent, 'trackPendingNode').returns()

        mockNode = new SagemakerDevSpaceNode(mockParent, mockDevSpace, mockHyperpodCluster, 'us-east-1')
        sandbox.stub(mockNode, 'refreshNode').resolves()
    })

    afterEach(function () {
        sandbox.restore()
    })

    describe('startHyperpodSpaceCommand', function () {
        it('throws error for Invalid space', async function () {
            mockNode.devSpace.status = 'Invalid'
            await assert.rejects(startHyperpodSpaceCommand(mockNode), /Cannot start an invalid space/)
        })

        it('throws error for Error space', async function () {
            mockNode.devSpace.status = 'Error'
            await assert.rejects(startHyperpodSpaceCommand(mockNode), /Cannot start space until resolved/)
        })

        it('returns immediately if already Running', async function () {
            mockNode.devSpace.status = 'Running'
            await startHyperpodSpaceCommand(mockNode)
            sinon.assert.notCalled(mockKubectlClient.startHyperpodDevSpace)
        })

        it('sets transitional state and calls kubectl start', async function () {
            mockNode.devSpace.status = 'Stopped'
            mockKubectlClient.startHyperpodDevSpace.resolves()

            await startHyperpodSpaceCommand(mockNode)

            assert.strictEqual(mockNode.devSpace.status, 'Starting')
            sinon.assert.calledOnce(mockKubectlClient.startHyperpodDevSpace)
        })
    })

    describe('stopHyperPodSpaceCommand', function () {
        it('does nothing if user cancels confirmation', async function () {
            sandbox.stub(messages, 'showConfirmationMessage').resolves(false)

            await stopHyperPodSpaceCommand(mockNode)

            sinon.assert.notCalled(mockKubectlClient.stopHyperpodDevSpace)
        })

        it('throws error for Error space', async function () {
            sandbox.stub(messages, 'showConfirmationMessage').resolves(true)
            mockNode.devSpace.status = 'Error'

            await assert.rejects(stopHyperPodSpaceCommand(mockNode), /Cannot stop space until resolved/)
        })

        it('sets transitional state and calls kubectl stop', async function () {
            sandbox.stub(messages, 'showConfirmationMessage').resolves(true)
            mockNode.devSpace.status = 'Running'
            mockKubectlClient.stopHyperpodDevSpace.resolves()

            await stopHyperPodSpaceCommand(mockNode)

            assert.strictEqual(mockNode.devSpace.status, 'Stopping')
            sinon.assert.calledOnce(mockKubectlClient.stopHyperpodDevSpace)
        })
    })
})
