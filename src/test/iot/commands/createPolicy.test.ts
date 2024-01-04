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

        iot = {} as any as IotClient
        node = new IotPolicyFolderNode(iot, new IotNode(iot))
        policyObject = { Version: '2012-10-17', Statement: '' }
        policyDocument = JSON.stringify(policyObject)
        returnUndefined = false
    })

    afterEach(function () {
        sandbox.restore()
    })

    it('prompts for policy name, creates policy, and shows success', async function () {
        const policyStub = sinon.stub()
        iot.createPolicy = policyStub
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

        assert(policyStub.calledOnceWithExactly({ policyName, policyDocument }))

        sandbox.assert.calledWith(spyExecuteCommand, 'aws.refreshAwsExplorerNode', node)
    })

    it('does nothing when prompt is canceled', async function () {
        const policyStub = sinon.stub()
        iot.createPolicy = policyStub
        getTestWindow().onDidShowInputBox(input => input.hide())

        assert(policyStub.notCalled)
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
        const policyStub = sinon.stub()
        iot.createPolicy = policyStub
        returnUndefined = true
        getTestWindow().onDidShowInputBox(input => input.acceptValue(policyName))
        await createPolicyCommand(node, getPolicy)

        assert(policyStub.notCalled)
        sandbox.assert.notCalled(spyExecuteCommand)
    })

    it('shows an error message when JSON is invalid', async function () {
        const policyStub = sinon.stub()
        iot.createPolicy = policyStub
        getTestWindow().onDidShowInputBox(input => input.acceptValue(policyName))
        returnUndefined = false
        policyDocument = 'not a JSON'
        await createPolicyCommand(node, getPolicy)

        getTestWindow()
            .getFirstMessage()
            .assertError(/Failed to create policy test-policy/)

        assert(policyStub.notCalled)

        sandbox.assert.notCalled(spyExecuteCommand)
    })

    it('shows an error message if creating policy fails', async function () {
        const policyStub = sinon.stub().rejects()
        iot.createPolicy = policyStub
        returnUndefined = false

        getTestWindow().onDidShowInputBox(input => input.acceptValue(policyName))
        await createPolicyCommand(node, getPolicy)

        getTestWindow()
            .getFirstMessage()
            .assertError(/Failed to create policy test-policy/)

        sandbox.assert.notCalled(spyExecuteCommand)
    })
})
