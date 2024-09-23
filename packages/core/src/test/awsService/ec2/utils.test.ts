/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import { Ec2Client, SafeEc2Instance } from '../../../shared/clients/ec2Client'
import { getIconCode } from '../../../awsService/ec2/utils'
import { Ec2InstanceNode } from '../../../awsService/ec2/explorer/ec2InstanceNode'
import { Ec2ParentNode } from '../../../awsService/ec2/explorer/ec2ParentNode'
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
})
