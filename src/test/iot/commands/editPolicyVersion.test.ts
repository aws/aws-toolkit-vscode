/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { editPolicyVersionCommand } from '../../../iot/commands/editPolicyVersion'
import { IotPolicyFolderNode } from '../../../iot/explorer/iotPolicyFolderNode'
import { IotPolicyWithVersionsNode } from '../../../iot/explorer/iotPolicyNode'
import { IotPolicyVersionNode } from '../../../iot/explorer/iotPolicyVersionNode'
import { IotClient } from '../../../shared/clients/iotClient'
import { anything, mock, instance, when, deepEqual } from '../../utilities/mockito'
import { getTabSizeSetting } from '../../../shared/utilities/editorUtilities'

const AWS_IOT_EXAMPLE_POLICY =
    '{ "Version": "2012-10-17", "Statement": [ {"Effect": "Allow", "Action": "*", "Resource": "*" } ] }'

const expectedPolicy = JSON.stringify(JSON.parse(AWS_IOT_EXAMPLE_POLICY), undefined, getTabSizeSetting())

describe('editPolicyVersionCommand', function () {
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
        const insertStub = stubTextEditInsert()
        when(iot.getPolicyVersion(deepEqual({ policyName, policyVersionId: 'V1' }))).thenResolve({
            policyDocument: AWS_IOT_EXAMPLE_POLICY,
        })
        await editPolicyVersionCommand(node)

        assert.strictEqual(insertStub.calledOnce, true, 'should be called once')
        assert.strictEqual(insertStub.getCalls()[0].args[1], expectedPolicy, 'should insert pretty json')
    })

    it('does nothing when policy retrieval fails', async function () {
        const insertStub = stubTextEditInsert()
        when(iot.getPolicyVersion(anything())).thenReject(new Error('Expected failure'))

        await editPolicyVersionCommand(node)

        assert.strictEqual(insertStub.notCalled, true, 'should not be called')
    })

    function stubTextEditInsert() {
        const textEdit = {
            insert: () => {},
        } as any as vscode.TextEditorEdit

        const textEditor = {
            edit: () => {},
        } as any as vscode.TextEditor

        sinon.stub(textEditor, 'edit').callsFake(async editBuilder => {
            editBuilder(textEdit)

            return true
        })

        sandbox.stub(vscode.window, 'showTextDocument').returns(Promise.resolve(textEditor))
        const insertStub = sandbox.stub(textEdit, 'insert')

        return insertStub
    }
})
