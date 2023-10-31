/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { copyEndpointCommand } from '../../../iot/commands/copyEndpoint'
import { IotNode } from '../../../iot/explorer/iotNodes'
import { IotClient } from '../../../shared/clients/iotClient'
import { getTestWindow } from '../../shared/vscode/window'
import { mock, instance, when } from '../../utilities/mockito'
import { FakeClipboard } from '../../shared/vscode/fakeEnv'

describe('copyEndpointCommand', function () {
    beforeEach(function () {
        const fakeClipboard = new FakeClipboard()
        sinon.stub(vscode.env, 'clipboard').value(fakeClipboard)
    })

    let iot: IotClient
    let node: IotNode

    beforeEach(function () {
        iot = mock()
        node = new IotNode(instance(iot))
    })

    it('copies endpoint to clipboard', async function () {
        when(iot.getEndpoint()).thenResolve('endpoint')

        await copyEndpointCommand(node)

        assert.strictEqual(await vscode.env.clipboard.readText(), 'endpoint')
    })

    it('shows an error message when retrieval fails', async function () {
        when(iot.getEndpoint()).thenReject(new Error('Expected failure'))

        await copyEndpointCommand(node)

        getTestWindow().getFirstMessage().assertError('Failed to retrieve endpoint')
    })
})
