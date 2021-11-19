/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { copyEndpointCommand } from '../../../iot/commands/copyEndpoint'
import { IotNode } from '../../../iot/explorer/iotNodes'
import { IotClient } from '../../../shared/clients/iotClient'
import { FakeEnv } from '../../shared/vscode/fakeEnv'
import { FakeWindow } from '../../shared/vscode/fakeWindow'
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

        const window = new FakeWindow()
        const env = new FakeEnv()
        await copyEndpointCommand(node, window, env)

        assert.strictEqual(env.clipboard.text, 'endpoint')
    })

    it('shows an error message when retrieval fails', async function () {
        when(iot.getEndpoint()).thenReject(new Error('Expected failure'))

        const window = new FakeWindow()
        const env = new FakeEnv()
        await copyEndpointCommand(node, window, env)

        assert.strictEqual(window.message.error, 'Failed to retrieve endpoint')
    })
})
