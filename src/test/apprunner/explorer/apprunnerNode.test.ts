/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as FakeTimers from '@sinonjs/fake-timers'
import * as sinon from 'sinon'
import { AppRunner } from 'aws-sdk'
import { AppRunnerNode } from '../../../apprunner/explorer/apprunnerNode'
import { AppRunnerServiceNode } from '../../../apprunner/explorer/apprunnerServiceNode'
import { AppRunnerClient } from '../../../shared/clients/apprunnerClient'
import { PlaceholderNode } from '../../../shared/treeview/nodes/placeholderNode'
import { AWSTreeNodeBase } from '../../../shared/treeview/nodes/awsTreeNodeBase'
import { installFakeClock } from '../../testUtil'

describe('AppRunnerNode', function () {
    let mockApprunnerClient: AppRunnerClient
    let node: AppRunnerNode
    let clock: FakeTimers.InstalledClock
    let refreshStub: sinon.SinonStub<[], void>

    const exampleSummaries: AppRunner.ServiceSummaryList = [
        {
            ServiceName: 'test1',
            Status: 'RUNNING',
            ServiceArn: 'test-arn1',
        },
    ]

    before(function () {
        clock = installFakeClock()
        refreshStub = sinon.stub(AWSTreeNodeBase.prototype, 'refresh')
    })

    beforeEach(function () {
        mockApprunnerClient = {
            listServices: sinon.stub().resolves({ ServiceSummaryList: exampleSummaries }),
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
        const serviceStub = sinon.stub().resolves({ ServiceSummaryList: [updatedSummary] })
        mockApprunnerClient.listServices = serviceStub

        await node.getChildren()
        assert.strictEqual(childNode.info.Status, 'PAUSED')
    })

    it('deletes AppRunnerServiceNodes', async function () {
        await node.getChildren()
        const serviceStub = sinon.stub().resolves({ ServiceSummaryList: [] })
        mockApprunnerClient.listServices = serviceStub

        assert.ok((await node.getChildren())[0] instanceof PlaceholderNode)
    })

    it('polls children nodes', async function () {
        const transientService = { ...exampleSummaries[0], Status: 'OPERATION_IN_PROGRESS' }
        const pausedService = { ...transientService, Status: 'PAUSED' }
        const serviceStub = sinon
            .stub()
            .onFirstCall()
            .resolves({ ServiceSummaryList: [transientService] })
            .onSecondCall()
            .resolves({ ServiceSummaryList: [pausedService] })
        mockApprunnerClient.listServices = serviceStub
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
