/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import { AppRunner } from 'aws-sdk'
import { AppRunnerNode } from '../../../apprunner/explorer/apprunnerNode'
import { AppRunnerServiceNode } from '../../../apprunner/explorer/apprunnerServiceNode'
import { DefaultAppRunnerClient } from '../../../shared/clients/apprunnerClient'
import { DefaultCloudWatchLogsClient } from '../../../shared/clients/cloudWatchLogsClient'
import { asyncGenerator } from '../../../shared/utilities/collectionUtils'
import { AWSTreeNodeBase } from '../../../shared/treeview/nodes/awsTreeNodeBase'
import { stub } from '../../utilities/stubber'
import { getLabel } from '../../../shared/treeview/utils'

describe('AppRunnerServiceNode', function () {
    let mockApprunnerClient: ReturnType<typeof stub<DefaultAppRunnerClient>>
    let mockParentNode: AppRunnerNode
    let node: AppRunnerServiceNode

    const exampleInfo: AppRunner.Service = {
        ServiceName: 'test1',
        Status: 'RUNNING',
        ServiceArn: 'test-arn1',
        ServiceUrl: '',
        ServiceId: 'id',
    } as any

    before(function () {
        sinon.stub(AWSTreeNodeBase.prototype, 'refresh')
    })

    beforeEach(function () {
        const cloudwatchClient = stub(DefaultCloudWatchLogsClient, { regionCode: 'us-east-1' })
        cloudwatchClient.describeLogGroups.returns(asyncGenerator([{ logGroupName: 'logs' }]))

        mockApprunnerClient = stub(DefaultAppRunnerClient, { regionCode: 'us-east-1' })
        mockApprunnerClient.listOperations.resolves({ OperationSummaryList: [] })
        mockParentNode = stub(AppRunnerNode, {
            regionCode: '',
            client: mockApprunnerClient,
            serviceId: undefined,
            label: undefined,
            id: undefined,
            iconPath: undefined,
            description: undefined,
            resourceUri: undefined,
            tooltip: undefined,
            command: undefined,
            collapsibleState: undefined,
            contextValue: undefined,
            accessibilityInformation: undefined,
            checkboxState: undefined,
        })
        node = new AppRunnerServiceNode(mockParentNode, mockApprunnerClient, exampleInfo, {}, cloudwatchClient)
    })

    after(function () {
        sinon.restore()
    })

    it('can pause', async function () {
        mockApprunnerClient.pauseService.resolves({ Service: { ...exampleInfo, Status: 'PAUSED' } })
        await node.pause()
        assert.ok(getLabel(node).includes('Paused'))
    })

    it('can resume', async function () {
        node.update({ ...exampleInfo, Status: 'PAUSED' })
        mockApprunnerClient.resumeService.resolves({ Service: { ...exampleInfo, Status: 'RUNNING' } })
        await node.resume()
        assert.ok(getLabel(node).includes('Running'))
    })

    it('can deploy', async function () {
        mockApprunnerClient.startDeployment.resolves({ OperationId: '123' })
        node.update({ ...exampleInfo, Status: 'OPERATION_IN_PROGRESS' })
        await node.deploy()
        assert.ok(getLabel(node).includes('Deploying'))
    })

    it('can describe', async function () {
        mockApprunnerClient.describeService.resolves({ Service: { ...exampleInfo, Status: 'CREATE_FAILED' } })
        assert.strictEqual((await node.describe()).Status, 'CREATE_FAILED')
        assert.ok(getLabel(node).includes('Create failed'))
    })

    it('can update', async function () {
        mockApprunnerClient.updateService.resolves({
            Service: { ...exampleInfo, Status: 'OPERATION_IN_PROGRESS' },
            OperationId: '123',
        })
        await node.updateService({} as any)
        assert.ok(getLabel(node).includes('Updating'))
    })

    it('can delete', async function () {
        mockApprunnerClient.deleteService.resolves({
            Service: { ...exampleInfo, Status: 'DELETED' },
            OperationId: '123',
        })
        const deleteStub = sinon.stub()
        mockParentNode.deleteNode = deleteStub
        await node.delete()
        assert(deleteStub.calledOnceWith(exampleInfo.ServiceArn))
    })

    it('can log', async function () {
        const logs = await node.getChildren()
        assert.strictEqual(logs[0]?.label, 'logs')
    })
})
