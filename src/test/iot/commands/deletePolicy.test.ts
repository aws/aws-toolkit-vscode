/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { Iot } from 'aws-sdk'
import { deletePolicyCommand } from '../../../iot/commands/deletePolicy'
import { IotPolicyFolderNode } from '../../../iot/explorer/iotPolicyFolderNode'
import { IotPolicyWithVersionsNode } from '../../../iot/explorer/iotPolicyNode'
import { IotNode } from '../../../iot/explorer/iotNodes'
import { IotClient } from '../../../shared/clients/iotClient'
import { asyncGenerator } from '../../../shared/utilities/collectionUtils'
import { anything, mock, instance, when, deepEqual, verify } from '../../utilities/mockito'
import { getTestWindow } from '../../shared/vscode/window'

describe('deletePolicyCommand', function () {
    const policyName = 'test-policy'
    let iot: IotClient
    let node: IotPolicyWithVersionsNode
    let parentNode: IotPolicyFolderNode

    let sandbox: sinon.SinonSandbox
    let spyExecuteCommand: sinon.SinonSpy

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        spyExecuteCommand = sandbox.spy(vscode.commands, 'executeCommand')

        iot = mock()
        parentNode = new IotPolicyFolderNode(instance(iot), new IotNode(instance(iot)))
        node = new IotPolicyWithVersionsNode({ name: policyName, arn: 'arn' }, parentNode, instance(iot))
    })

    afterEach(function () {
        sandbox.restore()
    })

    it('confirms deletion, deletes policy, and refreshes node', async function () {
        when(iot.listPolicyTargets(deepEqual({ policyName }))).thenResolve([])
        const policyVersions = ['1']
        when(iot.listPolicyVersions(anything())).thenReturn(
            asyncGenerator<Iot.PolicyVersion>(
                policyVersions.map<Iot.PolicyVersion>(versionId => {
                    return {
                        versionId: versionId,
                    }
                })
            )
        )

        getTestWindow().onDidShowMessage(m => m.items.find(i => i.title === 'Delete')?.select())
        await deletePolicyCommand(node)

        getTestWindow().getFirstMessage().assertWarn('Are you sure you want to delete Policy test-policy?')

        verify(iot.deletePolicy(deepEqual({ policyName }))).once()

        sandbox.assert.calledWith(spyExecuteCommand, 'aws.refreshAwsExplorerNode', parentNode)
    })

    it('does nothing when certificates are attached', async function () {
        when(iot.listPolicyTargets(deepEqual({ policyName }))).thenResolve(['cert'])
        getTestWindow().onDidShowMessage(m => m.items.find(i => i.title === 'Delete')?.select())
        await deletePolicyCommand(node)

        getTestWindow()
            .getSecondMessage()
            .assertError(/Policy has attached certificates: cert/)

        verify(iot.deletePolicy(anything())).never()
    })

    it('does nothing when multiple versions are present', async function () {
        when(iot.listPolicyTargets(deepEqual({ policyName }))).thenResolve([])
        const policyVersions = ['1', '2']
        when(iot.listPolicyVersions(anything())).thenReturn(
            asyncGenerator<Iot.PolicyVersion>(
                policyVersions.map<Iot.PolicyVersion>(versionId => {
                    return {
                        versionId: versionId,
                    }
                })
            )
        )
        getTestWindow().onDidShowMessage(m => m.items.find(i => i.title === 'Delete')?.select())
        await deletePolicyCommand(node)

        verify(iot.deletePolicy(anything())).never()
    })

    it('does nothing when deletion is cancelled', async function () {
        getTestWindow().onDidShowMessage(m => m.selectItem('Cancel'))
        await deletePolicyCommand(node)

        verify(iot.deletePolicy(anything())).never()
    })

    it('shows an error message and refreshes node when policy deletion fails', async function () {
        when(iot.deletePolicy(anything())).thenReject(new Error('Expected failure'))

        getTestWindow().onDidShowMessage(m => m.items.find(i => i.title === 'Delete')?.select())
        await deletePolicyCommand(node)

        getTestWindow()
            .getSecondMessage()
            .assertError(/Failed to delete Policy: test-policy/)

        sandbox.assert.calledWith(spyExecuteCommand, 'aws.refreshAwsExplorerNode', parentNode)
    })
})
