/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { detachPolicyCommand } from '../../../iot/commands/detachPolicy'
import { IotCertWithPoliciesNode } from '../../../iot/explorer/iotCertificateNode'
import { IotCertsFolderNode } from '../../../iot/explorer/iotCertFolderNode'
import { IotPolicyCertNode } from '../../../iot/explorer/iotPolicyNode'
import { IotClient } from '../../../shared/clients/iotClient'
import { FakeCommands } from '../../shared/vscode/fakeCommands'
import { FakeWindow } from '../../shared/vscode/fakeWindow'
import { anything, mock, instance, when, deepEqual, verify } from '../../utilities/mockito'

describe('detachPolicyCommand', function () {
    const policyName = 'test-policy'
    const target = 'cert:arn'
    let iot: IotClient
    let node: IotPolicyCertNode
    let parentNode: IotCertWithPoliciesNode

    beforeEach(function () {
        iot = mock()
        parentNode = new IotCertWithPoliciesNode(
            { id: 'id', arn: target, activeStatus: 'ACTIVE', creationDate: new Date() },
            {} as IotCertsFolderNode,
            instance(iot)
        )
        node = new IotPolicyCertNode({ name: policyName, arn: 'arn' }, parentNode, instance(iot))
    })

    it('confirms detach, detaches policy, and refreshes node', async function () {
        const window = new FakeWindow({ message: { warningSelection: 'Detach' } })
        const commands = new FakeCommands()
        await detachPolicyCommand(node, window, commands)

        assert.strictEqual(window.message.warning, 'Are you sure you want to detach policy test-policy?')

        verify(iot.detachPolicy(deepEqual({ policyName, target }))).once()

        assert.strictEqual(commands.command, 'aws.refreshAwsExplorerNode')
        assert.deepStrictEqual(commands.args, [parentNode])
    })

    it('does nothing when cancelled', async function () {
        const window = new FakeWindow({ message: { warningSelection: 'Cancel' } })
        await detachPolicyCommand(node, window, new FakeCommands())

        verify(iot.detachPolicy(anything())).never()
    })

    it('shows an error message and refreshes node when thing detachment fails', async function () {
        when(iot.detachPolicy(anything())).thenReject(new Error('Expected failure'))

        const window = new FakeWindow({ message: { warningSelection: 'Detach' } })
        const commands = new FakeCommands()
        await detachPolicyCommand(node, window, commands)

        assert.ok(window.message.error?.includes('Failed to detach test-policy'))

        assert.strictEqual(commands.command, 'aws.refreshAwsExplorerNode')
        assert.deepStrictEqual(commands.args, [parentNode])
    })
})
