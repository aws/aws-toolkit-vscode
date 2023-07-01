/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { setDefaultPolicy } from '../../../iot/commands/setDefaultPolicy'
import { IotNode } from '../../../iot/explorer/iotNodes'
import { IotPolicyFolderNode } from '../../../iot/explorer/iotPolicyFolderNode'
import { IotPolicyWithVersionsNode } from '../../../iot/explorer/iotPolicyNode'
import { IotPolicyVersionNode } from '../../../iot/explorer/iotPolicyVersionNode'
import { IotClient } from '../../../shared/clients/iotClient'
import { FakeCommands } from '../../shared/vscode/fakeCommands'
import { getTestWindow } from '../../shared/vscode/window'
import { anything, mock, instance, when, deepEqual, verify } from '../../utilities/mockito'

describe('setDefaultPolicy', function () {
    const policyName = 'test-policy'
    let iot: IotClient
    let node: IotPolicyVersionNode
    let parentNode: IotPolicyWithVersionsNode
    let parentParentNode: IotPolicyFolderNode
    let commands: FakeCommands

    beforeEach(function () {
        iot = mock()
        parentParentNode = new IotPolicyFolderNode(instance(iot), new IotNode(instance(iot)))
        parentNode = new IotPolicyWithVersionsNode({ name: policyName, arn: 'arn' }, parentParentNode, instance(iot))
        node = new IotPolicyVersionNode(
            { name: policyName, arn: 'arn' },
            { versionId: 'V1', isDefaultVersion: false },
            false,
            parentNode,
            instance(iot)
        )
        commands = new FakeCommands()
    })

    it('sets default version and refreshes node', async function () {
        await setDefaultPolicy(node, commands)

        getTestWindow()
            .getFirstMessage()
            .assertInfo(/Set V1 as default version of test-policy/)
        verify(iot.setDefaultPolicyVersion(deepEqual({ policyName, policyVersionId: 'V1' }))).once()

        assert.strictEqual(commands.command, 'aws.refreshAwsExplorerNode')
    })

    it('shows an error message and refreshes node when deletion fails', async function () {
        when(iot.setDefaultPolicyVersion(anything())).thenReject(new Error('Expected failure'))
        await setDefaultPolicy(node, commands)

        getTestWindow()
            .getFirstMessage()
            .assertError(/Failed to set default policy version/)

        assert.strictEqual(commands.command, 'aws.refreshAwsExplorerNode')
    })
})
