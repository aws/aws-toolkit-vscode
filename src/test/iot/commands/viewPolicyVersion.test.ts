/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { viewPolicyVersionCommand } from '../../../iot/commands/viewPolicyVersion'
import { IotPolicyFolderNode } from '../../../iot/explorer/iotPolicyFolderNode'
import { IotPolicyWithVersionsNode } from '../../../iot/explorer/iotPolicyNode'
import { IotPolicyVersionNode } from '../../../iot/explorer/iotPolicyVersionNode'
import { IotClient } from '../../../shared/clients/iotClient'
import { anything, mock, instance, when, deepEqual } from '../../utilities/mockito'
import { getTabSizeSetting } from '../../../shared/utilities/editorUtilities'

const awsIotExamplePolicy =
    '{ "Version": "2012-10-17", "Statement": [ {"Effect": "Allow", "Action": "*", "Resource": "*" } ] }'

const expectedPolicy = JSON.stringify(JSON.parse(awsIotExamplePolicy), undefined, getTabSizeSetting())

describe('viewPolicyVersionCommand', function () {
    const policyName = 'test-policy'
    let iot: IotClient
    let node: IotPolicyVersionNode
    let parentNode: IotPolicyWithVersionsNode
    let sandbox: sinon.SinonSandbox

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
        sandbox = sinon.createSandbox()
    })

    this.afterEach(function () {
        sandbox.restore()
    })

    it('inserts policy document into editor', async function () {
        const textEditor = {} as vscode.TextDocument
        const openTextDocumentStub = sandbox
            .stub(vscode.workspace, 'openTextDocument')
            .returns(Promise.resolve(textEditor))
        const showTextDocumentStub = sandbox.stub(vscode.window, 'showTextDocument').resolves({} as vscode.TextEditor)

        when(iot.getPolicyVersion(deepEqual({ policyName, policyVersionId: 'V1' }))).thenResolve({
            policyDocument: awsIotExamplePolicy,
        })
        await viewPolicyVersionCommand(node)

        assert.strictEqual(openTextDocumentStub.calledOnce, true, 'should be called once')
        assert.deepStrictEqual(
            openTextDocumentStub.getCalls()[0].args[0],
            {
                language: 'json',
                content: expectedPolicy,
            },
            'should open with correct content and language'
        )

        assert.strictEqual(showTextDocumentStub.calledOnce, true, 'should be called once')
        assert.strictEqual(showTextDocumentStub.getCall(0).args[0], textEditor)
    })

    it('does nothing when policy retrieval fails', async function () {
        const openTextDocumentStub = sandbox
            .stub(vscode.workspace, 'openTextDocument')
            .returns(Promise.resolve({} as vscode.TextDocument))
        when(iot.getPolicyVersion(anything())).thenReject(new Error('Expected failure'))

        await viewPolicyVersionCommand(node)

        assert.strictEqual(openTextDocumentStub.notCalled, true, 'should not be called')
    })
})
