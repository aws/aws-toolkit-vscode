/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import { AppRunner } from 'aws-sdk'
import { verify, anything, instance, mock, when } from 'ts-mockito'
import { AppRunnerNode } from '../../../apprunner/explorer/apprunnerNode'
import { AppRunnerServiceNode } from '../../../apprunner/explorer/apprunnerServiceNode'
import { AppRunnerClient } from '../../../shared/clients/apprunnerClient'
import { ext } from '../../../shared/extensionGlobals'
import { CloudWatchLogsClient } from '../../../shared/clients/cloudWatchLogsClient'
import { asyncGenerator } from '../../utilities/collectionUtils'
import { AWSTreeNodeBase } from '../../../shared/treeview/nodes/awsTreeNodeBase'

describe('AppRunnerServiceNode', function () {
    let mockApprunnerClient: AppRunnerClient
    let mockCloudWatchLogsClient: CloudWatchLogsClient
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
        mockCloudWatchLogsClient = mock()
        // Forces assignment of the property key without affecting its value
        // eslint-disable-next-line no-self-assign
        ext.toolkitClientBuilder = ext.toolkitClientBuilder
        sinon.stub(AWSTreeNodeBase.prototype, 'refresh')
        sinon.stub(ext, 'toolkitClientBuilder').value({
            createCloudWatchLogsClient: () => instance(mockCloudWatchLogsClient),
        } as any)
    })

    beforeEach(function () {
        mockApprunnerClient = mock()
        mockParentNode = mock()
        node = new AppRunnerServiceNode(instance(mockParentNode), instance(mockApprunnerClient), exampleInfo)
        when(mockApprunnerClient.listOperations(anything())).thenResolve({ OperationSummaryList: [] })
        when(mockCloudWatchLogsClient.describeLogGroups(anything())).thenReturn(
            asyncGenerator([{ logGroupName: 'logs' }])
        )
    })

    after(function () {
        sinon.restore()
    })

    it('can pause', async function () {
        when(mockApprunnerClient.pauseService(anything())).thenResolve({
            Service: { ...exampleInfo, Status: 'PAUSED' },
        })
        await node.pause()
        assert.ok(node.label?.includes('Paused'))
    })

    it('can resume', async function () {
        node.update({ ...exampleInfo, Status: 'PAUSED' })
        when(mockApprunnerClient.resumeService(anything())).thenResolve({
            Service: { ...exampleInfo, Status: 'RUNNING' },
        })
        await node.resume()
        assert.ok(node.label?.includes('Running'))
    })

    it('can deploy', async function () {
        when(mockApprunnerClient.startDeployment(anything())).thenResolve({ OperationId: '123' })
        node.update({ ...exampleInfo, Status: 'OPERATION_IN_PROGRESS' })
        await node.deploy()
        assert.ok(node.label?.includes('Deploying'))
    })

    it('can describe', async function () {
        when(mockApprunnerClient.describeService(anything())).thenResolve({
            Service: { ...exampleInfo, Status: 'CREATE_FAILED' },
        })
        assert.strictEqual((await node.describe()).Status, 'CREATE_FAILED')
        assert.ok(node.label?.includes('Create failed'))
    })

    it('can update', async function () {
        when(mockApprunnerClient.updateService(anything())).thenResolve({
            Service: { ...exampleInfo, Status: 'OPERATION_IN_PROGRESS' },
            OperationId: '123',
        })
        await node.updateService({} as any)
        assert.ok(node.label?.includes('Updating'))
    })

    it('can delete', async function () {
        when(mockApprunnerClient.deleteService(anything())).thenResolve({
            Service: { ...exampleInfo, Status: 'DELETED' },
            OperationId: '123',
        })
        await node.delete()
        verify(mockParentNode.deleteNode(exampleInfo.ServiceArn))
    })

    it('can log', async function () {
        const logs = await node.getChildren()
        assert.strictEqual(logs[0]?.label, 'logs')
    })
})
