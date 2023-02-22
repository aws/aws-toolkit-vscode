/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { detachPolicyCommand } from '../../../iot/commands/detachPolicy'
import { IotCertWithPoliciesNode } from '../../../iot/explorer/iotCertificateNode'
import { IotCertsFolderNode } from '../../../iot/explorer/iotCertFolderNode'
import { IotPolicyCertNode } from '../../../iot/explorer/iotPolicyNode'
import { IotClient } from '../../../shared/clients/iotClient'
import { FakeCommands } from '../../shared/vscode/fakeCommands'
import { anything, mock, instance, when, deepEqual, verify } from '../../utilities/mockito'
import { IotNode } from '../../../iot/explorer/iotNodes'
import globals from '../../../shared/extensionGlobals'
import { getTestWindow } from '../../shared/vscode/window'

describe('detachPolicyCommand', function () {
    const policyName = 'test-policy'
    const target = 'cert:arn'
    let iot: IotClient
    let node: IotPolicyCertNode
    let parentNode: IotCertWithPoliciesNode

    beforeEach(function () {
        iot = mock()
        parentNode = new IotCertWithPoliciesNode(
            { id: 'id', arn: target, activeStatus: 'ACTIVE', creationDate: new globals.clock.Date() },
            new IotCertsFolderNode(instance(iot), new IotNode(instance(iot))),
            instance(iot)
        )
        node = new IotPolicyCertNode({ name: policyName, arn: 'arn' }, parentNode, instance(iot))
    })

    it('confirms detach, detaches policy, and refreshes node', async function () {
        getTestWindow().onDidShowMessage(m => m.items.find(i => i.title === 'Detach')?.select())
        const commands = new FakeCommands()
        await detachPolicyCommand(node, commands)

        getTestWindow().getFirstMessage().assertWarn('Are you sure you want to detach policy test-policy?')

        verify(iot.detachPolicy(deepEqual({ policyName, target }))).once()
    })

    it('does nothing when cancelled', async function () {
        getTestWindow().onDidShowMessage(m => m.selectItem('Cancel'))
        await detachPolicyCommand(node, new FakeCommands())

        verify(iot.detachPolicy(anything())).never()
    })

    it('shows an error message and refreshes node when thing detachment fails', async function () {
        when(iot.detachPolicy(anything())).thenReject(new Error('Expected failure'))

        getTestWindow().onDidShowMessage(m => m.items.find(i => i.title === 'Detach')?.select())
        const commands = new FakeCommands()
        await detachPolicyCommand(node, commands)

        getTestWindow()
            .getSecondMessage()
            .assertError(/Failed to detach: test-policy/)
    })
})
