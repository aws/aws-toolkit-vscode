/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { deletePolicyVersionCommand } from '../../../iot/commands/deletePolicyVersion'
import { IotPolicyFolderNode } from '../../../iot/explorer/iotPolicyFolderNode'
import { IotPolicyWithVersionsNode } from '../../../iot/explorer/iotPolicyNode'
import { IotPolicyVersionNode } from '../../../iot/explorer/iotPolicyVersionNode'
import { IotClient } from '../../../shared/clients/iotClient'
import { getTestWindow } from '../../shared/vscode/window'
import { anything, mock, instance, when, deepEqual, verify } from '../../utilities/mockito'

describe('deletePolicyVersionCommand', function () {
    const policyName = 'test-policy'
    let iot: IotClient
    let node: IotPolicyVersionNode
    let parentNode: IotPolicyWithVersionsNode

    let sandbox: sinon.SinonSandbox
    let spyExecuteCommand: sinon.SinonSpy

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        spyExecuteCommand = sandbox.spy(vscode.commands, 'executeCommand')

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

    afterEach(function () {
        sandbox.restore()
    })

    it('confirms deletion, deletes policy, and refreshes node', async function () {
        getTestWindow().onDidShowMessage(m => m.items.find(i => i.title === 'Delete')?.select())
        await deletePolicyVersionCommand(node)

        getTestWindow()
            .getFirstMessage()
            .assertWarn('Are you sure you want to delete Version V1 of Policy test-policy?')

        verify(iot.deletePolicyVersion(deepEqual({ policyName, policyVersionId: 'V1' }))).once()

        sandbox.assert.calledWith(spyExecuteCommand, 'aws.refreshAwsExplorerNode')
    })

    it('does nothing when deletion is cancelled', async function () {
        getTestWindow().onDidShowMessage(m => m.selectItem('Cancel'))
        await deletePolicyVersionCommand(node)

        verify(iot.deletePolicyVersion(anything())).never()
    })

    it('shows an error message and refreshes node when deletion fails', async function () {
        when(iot.deletePolicyVersion(anything())).thenReject(new Error('Expected failure'))

        getTestWindow().onDidShowMessage(m => m.items.find(i => i.title === 'Delete')?.select())
        await deletePolicyVersionCommand(node)

        getTestWindow()
            .getSecondMessage()
            .assertError(/Failed to delete Version V1 of Policy test-policy/)

        sandbox.assert.calledWith(spyExecuteCommand, 'aws.refreshAwsExplorerNode')
    })
})
