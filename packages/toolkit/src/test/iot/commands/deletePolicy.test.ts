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
import { getTestWindow } from '../../shared/vscode/window'
import assert from 'assert'

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

        iot = {} as any as IotClient
        parentNode = new IotPolicyFolderNode(iot, new IotNode(iot))
        node = new IotPolicyWithVersionsNode({ name: policyName, arn: 'arn' }, parentNode, iot)
    })

    afterEach(function () {
        sandbox.restore()
    })

    it('confirms deletion, deletes policy, and refreshes node', async function () {
        const listPolicyStub = sinon.stub().resolves([])
        iot.listPolicyTargets = listPolicyStub
        const policyVersions = ['1']
        const listPolicyVersionsStub = sinon.stub().returns(
            asyncGenerator<Iot.PolicyVersion>(
                policyVersions.map<Iot.PolicyVersion>(versionId => {
                    return {
                        versionId: versionId,
                    }
                })
            )
        )
        iot.listPolicyVersions = listPolicyVersionsStub
        const deleteStub = sinon.stub()
        iot.deletePolicy = deleteStub

        getTestWindow().onDidShowMessage(m => m.items.find(i => i.title === 'Delete')?.select())
        await deletePolicyCommand(node)

        getTestWindow().getFirstMessage().assertWarn('Are you sure you want to delete Policy test-policy?')

        assert(listPolicyStub.calledOnceWithExactly({ policyName }))
        assert(deleteStub.calledOnceWithExactly({ policyName }))

        sandbox.assert.calledWith(spyExecuteCommand, 'aws.refreshAwsExplorerNode', parentNode)
    })

    it('does nothing when certificates are attached', async function () {
        const listPolicyStub = sinon.stub().resolves(['cert'])
        iot.listPolicyTargets = listPolicyStub
        const deleteStub = sinon.stub()
        iot.deletePolicy = deleteStub
        getTestWindow().onDidShowMessage(m => m.items.find(i => i.title === 'Delete')?.select())
        await deletePolicyCommand(node)

        getTestWindow()
            .getSecondMessage()
            .assertError(/Policy has attached certificates: cert/)

        assert(listPolicyStub.calledOnceWithExactly({ policyName }))
        assert(deleteStub.notCalled)
    })

    it('does nothing when multiple versions are present', async function () {
        const listPolicyStub = sinon.stub().resolves([])
        iot.listPolicyTargets = listPolicyStub
        const policyVersions = ['1', '2']
        const listPolicyVersionsStub = sinon.stub().returns(
            asyncGenerator<Iot.PolicyVersion>(
                policyVersions.map<Iot.PolicyVersion>(versionId => {
                    return {
                        versionId: versionId,
                    }
                })
            )
        )
        const deleteStub = sinon.stub()
        iot.deletePolicy = deleteStub
        iot.listPolicyVersions = listPolicyVersionsStub
        getTestWindow().onDidShowMessage(m => m.items.find(i => i.title === 'Delete')?.select())
        await deletePolicyCommand(node)

        assert(listPolicyStub.calledOnceWithExactly({ policyName }))
        assert(deleteStub.notCalled)
    })

    it('does nothing when deletion is cancelled', async function () {
        const deleteStub = sinon.stub()
        iot.deletePolicy = deleteStub
        getTestWindow().onDidShowMessage(m => m.selectItem('Cancel'))
        await deletePolicyCommand(node)

        assert(deleteStub.notCalled)
    })

    it('shows an error message and refreshes node when policy deletion fails', async function () {
        const deleteStub = sinon.stub().rejects()
        iot.deletePolicy = deleteStub

        getTestWindow().onDidShowMessage(m => m.items.find(i => i.title === 'Delete')?.select())
        await deletePolicyCommand(node)

        getTestWindow()
            .getSecondMessage()
            .assertError(/Failed to delete Policy: test-policy/)

        sandbox.assert.calledWith(spyExecuteCommand, 'aws.refreshAwsExplorerNode', parentNode)
    })
})
