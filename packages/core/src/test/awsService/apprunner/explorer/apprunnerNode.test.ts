/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as FakeTimers from '@sinonjs/fake-timers'
import * as sinon from 'sinon'
import { AppRunnerNode } from '../../../../awsService/apprunner/explorer/apprunnerNode'
import { AppRunnerServiceNode } from '../../../../awsService/apprunner/explorer/apprunnerServiceNode'
import { AppRunnerClient, ServiceSummary } from '../../../../shared/clients/apprunner'
import { PlaceholderNode } from '../../../../shared/treeview/nodes/placeholderNode'
import { AWSTreeNodeBase } from '../../../../shared/treeview/nodes/awsTreeNodeBase'
import { installFakeClock } from '../../../testUtil'
import { intoCollection } from '../../../../shared/utilities/collectionUtils'

describe('AppRunnerNode', function () {
    let mockApprunnerClient: AppRunnerClient
    let node: AppRunnerNode
    let clock: FakeTimers.InstalledClock
    let refreshStub: sinon.SinonStub<[], void>

    const exampleSummaries: ServiceSummary[] = [
        {
            ServiceName: 'test1',
            Status: 'RUNNING',
            ServiceArn: 'test-arn1',
            ServiceId: 'Amazon',
        },
    ]

    before(function () {
        clock = installFakeClock()
        refreshStub = sinon.stub(AWSTreeNodeBase.prototype, 'refresh')
    })

    beforeEach(function () {
        mockApprunnerClient = {
            paginateServices: sinon.stub().returns(intoCollection([exampleSummaries])),
            listOperations: sinon.stub().resolves({ OperationSummaryList: [] }),
        } as any as AppRunnerClient
        node = new AppRunnerNode('', mockApprunnerClient)
        clock.reset()
    })

    after(function () {
        clock.uninstall()
        sinon.restore()
    })

    it('creates AppRunnerServiceNodes', async function () {
        const children = await node.getChildren()
        assert.ok(children[0] instanceof AppRunnerServiceNode)
    })

    it('updates AppRunnerServiceNodes', async function () {
        const childNode = (await node.getChildren())[0] as AppRunnerServiceNode

        const updatedSummary = { ...exampleSummaries[0], Status: 'PAUSED' }
        const serviceStub = sinon.stub().returns(intoCollection([[updatedSummary]]))
        mockApprunnerClient.paginateServices = serviceStub

        await node.getChildren()
        assert.strictEqual(childNode.info.Status, 'PAUSED')
    })

    it('deletes AppRunnerServiceNodes', async function () {
        await node.getChildren()
        const serviceStub = sinon.stub().returns(intoCollection([[]]))
        mockApprunnerClient.paginateServices = serviceStub

        assert.ok((await node.getChildren())[0] instanceof PlaceholderNode)
    })

    it('polls children nodes', async function () {
        const transientService = { ...exampleSummaries[0], Status: 'OPERATION_IN_PROGRESS' }
        const pausedService = { ...transientService, Status: 'PAUSED' }
        const serviceStub = sinon
            .stub()
            .onFirstCall()
            .returns(intoCollection([[transientService]]))
            .onSecondCall()
            .returns(intoCollection([[pausedService]]))
        mockApprunnerClient.paginateServices = serviceStub
        const opStub = sinon.stub().resolves({
            OperationSummaryList: [{ Id: 'test-id', Type: 'PAUSE_SERVICE' }],
        })
        mockApprunnerClient.listOperations = opStub

        const childNode = (await node.getChildren())[0] as AppRunnerServiceNode
        await clock.tickAsync(100000)
        sinon.assert.calledOn(refreshStub, node)
        await node.getChildren()
        await clock.tickAsync(100000)
        assert(serviceStub.calledTwice)

        assert.strictEqual(childNode.info.Status, 'PAUSED')
    })
})
