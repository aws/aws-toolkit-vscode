/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import { PatchedEc2Instance } from '../../../shared/clients/ec2'
import { getIconCode } from '../../../awsService/ec2/utils'
import { DefaultAwsContext } from '../../../shared'

describe('utils', async function () {
    before(function () {
        sinon.stub(DefaultAwsContext.prototype, 'getCredentialAccountId')
    })

    after(function () {
        sinon.restore()
    })

    describe('getIconCode', function () {
        it('gives code based on status', function () {
            const runningInstance: PatchedEc2Instance = {
                InstanceId: 'X',
                LastSeenStatus: 'running',
            }
            const stoppedInstance: PatchedEc2Instance = {
                InstanceId: 'XX',
                LastSeenStatus: 'stopped',
            }
            const terminatedInstance: PatchedEc2Instance = {
                InstanceId: 'XXX',
                LastSeenStatus: 'terminated',
            }

            assert.strictEqual(getIconCode(runningInstance), 'pass')
            assert.strictEqual(getIconCode(stoppedInstance), 'circle-slash')
            assert.strictEqual(getIconCode(terminatedInstance), 'stop')
        })

        it('defaults to loading~spin', function () {
            const pendingInstance: PatchedEc2Instance = {
                InstanceId: 'X',
                LastSeenStatus: 'pending',
            }
            const stoppingInstance: PatchedEc2Instance = {
                InstanceId: 'XX',
                LastSeenStatus: 'shutting-down',
            }

            assert.strictEqual(getIconCode(pendingInstance), 'loading~spin')
            assert.strictEqual(getIconCode(stoppingInstance), 'loading~spin')
        })
    })
})
