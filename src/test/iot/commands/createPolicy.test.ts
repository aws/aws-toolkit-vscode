/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { createPolicyCommand } from '../../../iot/commands/createPolicy'
import { IotNode } from '../../../iot/explorer/iotNodes'
import { IotClient } from '../../../shared/clients/iotClient'
import { anything, mock, instance, when, deepEqual, verify } from '../../utilities/mockito'
import { IotPolicyFolderNode } from '../../../iot/explorer/iotPolicyFolderNode'
import { getTestWindow } from '../../shared/vscode/window'

describe('createPolicyCommand', function () {
    const policyName = 'test-policy'
    let iot: IotClient
    let policyObject: any
    let policyDocument: string
    let node: IotPolicyFolderNode
    let returnUndefined: boolean = false
    let sandbox: sinon.SinonSandbox
    let spyExecuteCommand: sinon.SinonSpy

    const getPolicy: () => Promise<Buffer | undefined> = async () => {
        if (returnUndefined) {
            return undefined
        }
        return Buffer.from(policyDocument, 'utf-8')
    }

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        spyExecuteCommand = sandbox.spy(vscode.commands, 'executeCommand')

        iot = mock()
        node = new IotPolicyFolderNode(instance(iot), new IotNode(instance(iot)))
        policyObject = { Version: '2012-10-17', Statement: '' }
        policyDocument = JSON.stringify(policyObject)
        returnUndefined = false
    })

    afterEach(function () {
        sandbox.restore()
    })

    it('prompts for policy name, creates policy, and shows success', async function () {
        getTestWindow().onDidShowInputBox(input => {
            assert.strictEqual(input.prompt, 'Enter a new policy name')
            assert.strictEqual(input.placeholder, 'Policy Name')
            input.acceptValue(policyName)
        })
        returnUndefined = false
        await createPolicyCommand(node, getPolicy)
        getTestWindow()
            .getFirstMessage()
            .assertInfo(/Created Policy test-policy/)

        verify(iot.createPolicy(deepEqual({ policyName, policyDocument }))).once()

        sandbox.assert.calledWith(spyExecuteCommand, 'aws.refreshAwsExplorerNode', node)
    })

    it('does nothing when prompt is canceled', async function () {
        getTestWindow().onDidShowInputBox(input => input.hide())

        verify(iot.createPolicy(anything())).never()
    })

    it('warns when policy name has invalid length', async function () {
        getTestWindow().onDidShowInputBox(input => {
            input.acceptValue('')
            assert.strictEqual(input.validationMessage, 'Policy name must be between 1 and 128 characters long')
            input.hide()
        })
        await createPolicyCommand(node, getPolicy)
    })

    it('warns when policy name has invalid characters', async function () {
        getTestWindow().onDidShowInputBox(input => {
            input.acceptValue('illegal/characters')
            assert.strictEqual(
                input.validationMessage,
                'Policy name must contain only alphanumeric characters and/or the following: +=.,@-'
            )
            input.hide()
        })
        await createPolicyCommand(node, getPolicy)
    })

    it('does nothing when policy document is not read', async function () {
        returnUndefined = true
        getTestWindow().onDidShowInputBox(input => input.acceptValue(policyName))
        await createPolicyCommand(node, getPolicy)

        verify(iot.createPolicy(anything())).never()
        sandbox.assert.notCalled(spyExecuteCommand)
    })

    it('shows an error message when JSON is invalid', async function () {
        getTestWindow().onDidShowInputBox(input => input.acceptValue(policyName))
        returnUndefined = false
        policyDocument = 'not a JSON'
        await createPolicyCommand(node, getPolicy)

        getTestWindow()
            .getFirstMessage()
            .assertError(/Failed to create policy test-policy/)

        verify(iot.createPolicy(anything())).never()

        sandbox.assert.notCalled(spyExecuteCommand)
    })

    it('shows an error message if creating policy fails', async function () {
        returnUndefined = false
        when(iot.createPolicy(anything())).thenReject(new Error('Expected failure'))

        getTestWindow().onDidShowInputBox(input => input.acceptValue(policyName))
        await createPolicyCommand(node, getPolicy)

        getTestWindow()
            .getFirstMessage()
            .assertError(/Failed to create policy test-policy/)

        sandbox.assert.notCalled(spyExecuteCommand)
    })
})
