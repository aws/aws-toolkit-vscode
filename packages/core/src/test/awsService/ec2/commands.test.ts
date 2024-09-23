/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { Ec2ConnectionManagerMap } from '../../../awsService/ec2/activation'
import { getConnectionManager } from '../../../awsService/ec2/commands'
import { Ec2ConnectionManager } from '../../../awsService/ec2/model'
import { Ec2Selection } from '../../../awsService/ec2/prompter'

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

        await cm.addActiveSession('sessionId', 'instanceId')

        const cm2 = await getConnectionManager(connectionManagers, fakeSelection)

        assert.strictEqual(cm2.isConnectedTo('instanceId'), true)
    })
})
