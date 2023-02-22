/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { copyEndpointCommand } from '../../../iot/commands/copyEndpoint'
import { IotNode } from '../../../iot/explorer/iotNodes'
import { IotClient } from '../../../shared/clients/iotClient'
import { getTestWindow } from '../../shared/vscode/window'
import { FakeEnv } from '../../shared/vscode/fakeEnv'
import { mock, instance, when } from '../../utilities/mockito'

describe('copyEndpointCommand', function () {
    let iot: IotClient
    let node: IotNode

    beforeEach(function () {
        iot = mock()
        node = new IotNode(instance(iot))
    })

    it('copies endpoint to clipboard', async function () {
        when(iot.getEndpoint()).thenResolve('endpoint')

        const env = new FakeEnv()
        await copyEndpointCommand(node, env)

        assert.strictEqual(env.clipboard.text, 'endpoint')
    })

    it('shows an error message when retrieval fails', async function () {
        when(iot.getEndpoint()).thenReject(new Error('Expected failure'))

        const env = new FakeEnv()
        await copyEndpointCommand(node, env)

        getTestWindow().getFirstMessage().assertError('Failed to retrieve endpoint')
    })
})
