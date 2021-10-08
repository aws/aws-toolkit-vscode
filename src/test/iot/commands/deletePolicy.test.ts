/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { deletePolicyCommand } from '../../../iot/commands/deletePolicy'
import { IotPolicyFolderNode } from '../../../iot/explorer/iotPolicyFolderNode'
import { IotPolicyWithVersionsNode } from '../../../iot/explorer/iotPolicyNode'
import { IotNode } from '../../../iot/explorer/iotNodes'
import { IotClient } from '../../../shared/clients/iotClient'
import { FakeCommands } from '../../shared/vscode/fakeCommands'
import { FakeWindow } from '../../shared/vscode/fakeWindow'
import { anything, mock, instance, when, deepEqual, verify } from '../../utilities/mockito'

describe('deletePolicyCommand', function () {
    const policyName = 'test-policy'
    let iot: IotClient
    let node: IotPolicyWithVersionsNode
    let parentNode: IotPolicyFolderNode

    beforeEach(function () {
        iot = mock()
        parentNode = new IotPolicyFolderNode(instance(iot), new IotNode(instance(iot)))
        node = new IotPolicyWithVersionsNode({ name: policyName, arn: 'arn' }, parentNode, instance(iot))
    })

    it('confirms deletion, deletes policy, and refreshes node', async function () {
        //when(iot.listThingPrincipals(deepEqual({ policyName }))).thenResolve({ principals: [] })

        const window = new FakeWindow({ message: { warningSelection: 'Delete' } })
        const commands = new FakeCommands()
        await deletePolicyCommand(node, window, commands)

        assert.strictEqual(window.message.warning, 'Are you sure you want to delete Policy test-policy?')

        verify(iot.deletePolicy(deepEqual({ policyName }))).once()

        assert.strictEqual(commands.command, 'aws.refreshAwsExplorerNode')
        assert.deepStrictEqual(commands.args, [parentNode])
    })

    it('does nothing when deletion is cancelled', async function () {
        const window = new FakeWindow({ message: { warningSelection: 'Cancel' } })
        await deletePolicyCommand(node, window, new FakeCommands())

        verify(iot.deletePolicy(anything())).never()
    })

    it('shows an error message and refreshes node when thing deletion fails', async function () {
        when(iot.deletePolicy(anything())).thenReject(new Error('Expected failure'))

        const window = new FakeWindow({ message: { warningSelection: 'Delete' } })
        const commands = new FakeCommands()
        await deletePolicyCommand(node, window, commands)

        assert.ok(window.message.error?.includes('Failed to delete Policy test-policy'))

        assert.strictEqual(commands.command, 'aws.refreshAwsExplorerNode')
        assert.deepStrictEqual(commands.args, [parentNode])
    })
})
