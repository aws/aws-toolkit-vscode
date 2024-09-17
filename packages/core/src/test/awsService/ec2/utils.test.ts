/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import { Ec2Client, SafeEc2Instance } from '../../../shared/clients/ec2Client'
import { getConnectionManager, getIconCode, getSelection, refreshExplorerNode } from '../../../awsService/ec2/utils'
import { Ec2InstanceNode } from '../../../awsService/ec2/explorer/ec2InstanceNode'
import { Ec2ParentNode } from '../../../awsService/ec2/explorer/ec2ParentNode'
import { Ec2Prompter, Ec2Selection } from '../../../awsService/ec2/prompter'
import { Ec2ConnectionManagerMap } from '../../../awsService/ec2/activation'
import { Ec2ConnectionManager } from '../../../awsService/ec2/model'
import { DefaultAwsContext } from '../../../shared'

describe('utils', async function () {
    let testInstance: SafeEc2Instance
    let testParentNode: Ec2ParentNode
    let testClient: Ec2Client
    let testNode: Ec2InstanceNode

    before(function () {
        sinon.stub(DefaultAwsContext.prototype, 'getCredentialAccountId')
        testInstance = {
            InstanceId: 'testId',
            Tags: [
                {
                    Key: 'Name',
                    Value: 'testName',
                },
            ],
            LastSeenStatus: 'running',
        }
        testClient = new Ec2Client('')
        testParentNode = new Ec2ParentNode('fake-region', 'testPartition', testClient)
        testNode = new Ec2InstanceNode(testParentNode, testClient, 'testRegion', 'testPartition', testInstance)
    })

    after(function () {
        sinon.restore()
    })

    describe('getIconCode', function () {
        it('gives code based on status', function () {
            const runningInstance: SafeEc2Instance = {
                InstanceId: 'X',
                LastSeenStatus: 'running',
            }
            const stoppedInstance: SafeEc2Instance = {
                InstanceId: 'XX',
                LastSeenStatus: 'stopped',
            }

            assert.strictEqual(getIconCode(runningInstance), 'pass')
            assert.strictEqual(getIconCode(stoppedInstance), 'circle-slash')
        })

        it('defaults to loading~spin', function () {
            const pendingInstance: SafeEc2Instance = {
                InstanceId: 'X',
                LastSeenStatus: 'pending',
            }
            const stoppingInstance: SafeEc2Instance = {
                InstanceId: 'XX',
                LastSeenStatus: 'shutting-down',
            }

            assert.strictEqual(getIconCode(pendingInstance), 'loading~spin')
            assert.strictEqual(getIconCode(stoppingInstance), 'loading~spin')
        })
    })

    describe('refreshExplorerNode', function () {
        after(function () {
            sinon.restore()
        })

        it('refreshes only parent node', async function () {
            const parentRefresh = sinon.stub(Ec2ParentNode.prototype, 'refreshNode')
            const childRefresh = sinon.stub(Ec2InstanceNode.prototype, 'refreshNode')

            await refreshExplorerNode(testNode)
            sinon.assert.calledOn(parentRefresh, testParentNode)

            parentRefresh.resetHistory()

            await refreshExplorerNode(testParentNode)
            sinon.assert.calledOn(parentRefresh, testParentNode)

            sinon.assert.notCalled(childRefresh)

            parentRefresh.restore()
            childRefresh.restore()
        })
    })

    describe('getSelection', async function () {
        it('uses node when passed', async function () {
            const prompterStub = sinon.stub(Ec2Prompter.prototype, 'promptUser')
            const result = await getSelection(testNode)

            assert.strictEqual(result.instanceId, testNode.toSelection().instanceId)
            assert.strictEqual(result.region, testNode.toSelection().region)
            sinon.assert.notCalled(prompterStub)
            prompterStub.restore()
        })

        it('prompts user when no node is passed', async function () {
            const prompterStub = sinon.stub(Ec2Prompter.prototype, 'promptUser')
            await getSelection()
            sinon.assert.calledOnce(prompterStub)
            prompterStub.restore()
        })
    })

    describe('getConnectionManager', async function () {
        let connectionManagers: Ec2ConnectionManagerMap

        beforeEach(function () {
            connectionManagers = new Map<string, Ec2ConnectionManager>()
        })

        it('only creates new connection managers once for each region ', async function () {
            const fakeSelection: Ec2Selection = {
                region: 'region-1',
                instanceId: 'fake-id',
            }

            const cm = await getConnectionManager(connectionManagers, fakeSelection)
            assert.strictEqual(connectionManagers.size, 1)

            await cm.addActiveEnv('sessionId', 'instanceId')

            const cm2 = await getConnectionManager(connectionManagers, fakeSelection)

            assert.strictEqual(cm2.isConnectedTo('instanceId'), true)
        })
    })
})
