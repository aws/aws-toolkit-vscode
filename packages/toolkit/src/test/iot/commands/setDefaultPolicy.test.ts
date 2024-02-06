/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { setDefaultPolicy } from '../../../iot/commands/setDefaultPolicy'
import { IotNode } from '../../../iot/explorer/iotNodes'
import { IotPolicyFolderNode } from '../../../iot/explorer/iotPolicyFolderNode'
import { IotPolicyWithVersionsNode } from '../../../iot/explorer/iotPolicyNode'
import { IotPolicyVersionNode } from '../../../iot/explorer/iotPolicyVersionNode'
import { IotClient } from '../../../shared/clients/iotClient'
import { getTestWindow } from '../../shared/vscode/window'
import assert from 'assert'

describe('setDefaultPolicy', function () {
    const policyName = 'test-policy'
    let iot: IotClient
    let node: IotPolicyVersionNode
    let parentNode: IotPolicyWithVersionsNode
    let parentParentNode: IotPolicyFolderNode
    let sandbox: sinon.SinonSandbox
    let spyExecuteCommand: sinon.SinonSpy

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        spyExecuteCommand = sandbox.spy(vscode.commands, 'executeCommand')

        iot = {} as any as IotClient
        parentParentNode = new IotPolicyFolderNode(iot, new IotNode(iot))
        parentNode = new IotPolicyWithVersionsNode({ name: policyName, arn: 'arn' }, parentParentNode, iot)
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

    it('sets default version and refreshes node', async function () {
        const stub = sinon.stub()
        iot.setDefaultPolicyVersion = stub
        await setDefaultPolicy(node)

        getTestWindow()
            .getFirstMessage()
            .assertInfo(/Set V1 as default version of test-policy/)
        assert(stub.calledOnceWithExactly({ policyName, policyVersionId: 'V1' }))

        sandbox.assert.calledWith(spyExecuteCommand, 'aws.refreshAwsExplorerNode')
    })

    it('shows an error message and refreshes node when deletion fails', async function () {
        const stub = sinon.stub().rejects()
        iot.setDefaultPolicyVersion = stub
        await setDefaultPolicy(node)

        getTestWindow()
            .getFirstMessage()
            .assertError(/Failed to set default policy version/)

        sandbox.assert.calledWith(spyExecuteCommand, 'aws.refreshAwsExplorerNode')
    })
})
