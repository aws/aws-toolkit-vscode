/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { deletePolicyVersionCommand } from '../../../iot/commands/deletePolicyVersion'
import { IotPolicyFolderNode } from '../../../iot/explorer/iotPolicyFolderNode'
import { IotPolicyWithVersionsNode } from '../../../iot/explorer/iotPolicyNode'
import { IotPolicyVersionNode } from '../../../iot/explorer/iotPolicyVersionNode'
import { IotClient } from '../../../shared/clients/iotClient'
import { FakeCommands } from '../../shared/vscode/fakeCommands'
import { getTestWindow } from '../../shared/vscode/window'
import { anything, mock, instance, when, deepEqual, verify } from '../../utilities/mockito'

describe('deletePolicyVersionCommand', function () {
    const policyName = 'test-policy'
    let iot: IotClient
    let node: IotPolicyVersionNode
    let parentNode: IotPolicyWithVersionsNode

    beforeEach(function () {
        iot = mock()
        parentNode = new IotPolicyWithVersionsNode(
            { name: policyName, arn: 'arn' },
            {} as IotPolicyFolderNode,
            instance(iot)
        )
        node = new IotPolicyVersionNode(
            { name: policyName, arn: 'arn' },
            { versionId: 'V1', isDefaultVersion: false },
            false,
            parentNode,
            instance(iot)
        )
    })

    it('confirms deletion, deletes policy, and refreshes node', async function () {
        getTestWindow().onDidShowMessage(m => m.items.find(i => i.title === 'Delete')?.select())
        const commands = new FakeCommands()
        await deletePolicyVersionCommand(node, commands)

        getTestWindow()
            .getFirstMessage()
            .assertWarn('Are you sure you want to delete Version V1 of Policy test-policy?')

        verify(iot.deletePolicyVersion(deepEqual({ policyName, policyVersionId: 'V1' }))).once()

        assert.strictEqual(commands.command, 'aws.refreshAwsExplorerNode')
    })

    it('does nothing when deletion is cancelled', async function () {
        getTestWindow().onDidShowMessage(m => m.selectItem('Cancel'))
        await deletePolicyVersionCommand(node, new FakeCommands())

        verify(iot.deletePolicyVersion(anything())).never()
    })

    it('shows an error message and refreshes node when deletion fails', async function () {
        when(iot.deletePolicyVersion(anything())).thenReject(new Error('Expected failure'))

        getTestWindow().onDidShowMessage(m => m.items.find(i => i.title === 'Delete')?.select())
        const commands = new FakeCommands()
        await deletePolicyVersionCommand(node, commands)

        getTestWindow()
            .getSecondMessage()
            .assertError(/Failed to delete Version V1 of Policy test-policy/)

        assert.strictEqual(commands.command, 'aws.refreshAwsExplorerNode')
    })
})
