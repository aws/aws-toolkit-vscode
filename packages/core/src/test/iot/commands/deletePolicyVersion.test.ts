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
import assert from 'assert'

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

        iot = {} as any as IotClient
        parentNode = new IotPolicyWithVersionsNode({ name: policyName, arn: 'arn' }, {} as IotPolicyFolderNode, iot)
        node = new IotPolicyVersionNode(
            { name: policyName, arn: 'arn' },
            { versionId: 'V1', isDefaultVersion: false },
            false,
            parentNode,
            iot
        )
    })

    afterEach(function () {
        sandbox.restore()
    })

    it('confirms deletion, deletes policy, and refreshes node', async function () {
        const deleteStub = sinon.stub()
        iot.deletePolicyVersion = deleteStub
        getTestWindow().onDidShowMessage(m => m.items.find(i => i.title === 'Delete')?.select())
        await deletePolicyVersionCommand(node)

        getTestWindow()
            .getFirstMessage()
            .assertWarn('Are you sure you want to delete Version V1 of Policy test-policy?')

        assert(deleteStub.calledOnceWithExactly({ policyName, policyVersionId: 'V1' }))

        sandbox.assert.calledWith(spyExecuteCommand, 'aws.refreshAwsExplorerNode')
    })

    it('does nothing when deletion is cancelled', async function () {
        const deleteStub = sinon.stub()
        iot.deletePolicyVersion = deleteStub
        getTestWindow().onDidShowMessage(m => m.selectItem('Cancel'))
        await deletePolicyVersionCommand(node)

        assert(deleteStub.notCalled)
    })

    it('shows an error message and refreshes node when deletion fails', async function () {
        const deleteStub = sinon.stub().rejects()
        iot.deletePolicyVersion = deleteStub

        getTestWindow().onDidShowMessage(m => m.items.find(i => i.title === 'Delete')?.select())
        await deletePolicyVersionCommand(node)

        getTestWindow()
            .getSecondMessage()
            .assertError(/Failed to delete Version V1 of Policy test-policy/)

        sandbox.assert.calledWith(spyExecuteCommand, 'aws.refreshAwsExplorerNode')
    })
})
