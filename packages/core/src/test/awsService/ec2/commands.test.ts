/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { Ec2Selection } from '../../../awsService/ec2/prompter'
import { Ec2ConnecterMap } from '../../../awsService/ec2/connectionManagerMap'

describe('getConnectionManager', async function () {
    let connectionManagers: Ec2ConnecterMap

    beforeEach(function () {
        connectionManagers = new Ec2ConnecterMap()
    })

    it('only creates new connection managers once for each region ', async function () {
        const fakeSelection: Ec2Selection = {
            region: 'region-1',
            instanceId: 'fake-id',
        }

        const cm = connectionManagers.getOrInit(fakeSelection.region)
        assert.strictEqual(connectionManagers.size, 1)

        await cm.addActiveSession('sessionId', 'instanceId')

        const cm2 = connectionManagers.getOrInit(fakeSelection.region)

        assert.strictEqual(cm2.isConnectedTo('instanceId'), true)
    })
})
