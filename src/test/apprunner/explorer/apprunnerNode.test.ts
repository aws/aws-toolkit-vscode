/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as FakeTimers from '@sinonjs/fake-timers'
import * as sinon from 'sinon'
import { AppRunner } from 'aws-sdk'
import { verify, anything, instance, mock, when } from 'ts-mockito'
import { AppRunnerNode } from '../../../apprunner/explorer/apprunnerNode'
import { AppRunnerServiceNode } from '../../../apprunner/explorer/apprunnerServiceNode'
import { AppRunnerClient } from '../../../shared/clients/apprunnerClient'
import { PlaceholderNode } from '../../../shared/treeview/nodes/placeholderNode'
import { ext } from '../../../shared/extensionGlobals'

describe('AppRunnerNode', function () {
    let mockApprunnerClient: AppRunnerClient
    let node: AppRunnerNode
    let clock: FakeTimers.InstalledClock

    const exampleSummaries: AppRunner.ServiceSummaryList = [
        {
            ServiceName: 'test1',
            Status: 'RUNNING',
            ServiceArn: 'test-arn1',
        },
    ]

    before(function () {
        clock = FakeTimers.install()
        // Forces assignment of the property key without affecting its value
        // eslint-disable-next-line no-self-assign
        ext.awsExplorer = ext.awsExplorer
        sinon.stub(ext, 'awsExplorer').value({
            refresh: (target: AppRunnerNode | AppRunnerServiceNode | undefined) => {
                if (target === node) {
                    target.getChildren()
                }
            },
        } as any)
    })

    beforeEach(function () {
        mockApprunnerClient = mock()
        node = new AppRunnerNode('', instance(mockApprunnerClient))
        when(mockApprunnerClient.listServices(anything())).thenResolve({ ServiceSummaryList: exampleSummaries })
        when(mockApprunnerClient.listOperations(anything())).thenResolve({ OperationSummaryList: [] })
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
        when(mockApprunnerClient.listServices(anything())).thenResolve({ ServiceSummaryList: [updatedSummary] })

        await node.getChildren()
        assert.strictEqual(childNode.info.Status, 'PAUSED')
    })

    it('deletes AppRunnerServiceNodes', async function () {
        await node.getChildren()
        when(mockApprunnerClient.listServices(anything())).thenResolve({ ServiceSummaryList: [] })

        assert.ok((await node.getChildren())[0] instanceof PlaceholderNode)
    })

    it('polls children nodes', async function () {
        const transientService = { ...exampleSummaries[0], Status: 'OPERATION_IN_PROGRESS' }
        when(mockApprunnerClient.listServices(anything())).thenResolve({ ServiceSummaryList: [transientService] })
        when(mockApprunnerClient.listOperations(anything())).thenResolve({
            OperationSummaryList: [{ Id: 'test-id', Type: 'PAUSE_SERVICE' }],
        })

        const childNode = (await node.getChildren())[0] as AppRunnerServiceNode
        const pausedService = { ...transientService, Status: 'PAUSED' }
        when(mockApprunnerClient.listServices(anything())).thenResolve({ ServiceSummaryList: [pausedService] })

        await clock.tickAsync(100000)
        verify(mockApprunnerClient.listServices(anything())).times(2)

        assert.strictEqual(childNode.info.Status, 'PAUSED')
    })
})
