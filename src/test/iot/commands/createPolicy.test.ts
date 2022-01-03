/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { createPolicyCommand } from '../../../iot/commands/createPolicy'
import { IotNode } from '../../../iot/explorer/iotNodes'
import { IotClient } from '../../../shared/clients/iotClient'
import { FakeWindow } from '../../shared/vscode/fakeWindow'
import { anything, mock, instance, when, deepEqual, verify } from '../../utilities/mockito'
import { FakeCommands } from '../../shared/vscode/fakeCommands'
import { Window } from '../../../shared/vscode/window'
import { IotPolicyFolderNode } from '../../../iot/explorer/iotPolicyFolderNode'

describe('createPolicyCommand', function () {
    const policyName = 'test-policy'
    let iot: IotClient
    let policyObject: any
    let policyDocument: string
    let node: IotPolicyFolderNode
    let returnUndefined: boolean = false
    const getPolicy: (window: Window) => Promise<Buffer | undefined> = async window => {
        if (returnUndefined) {
            return undefined
        }
        return Buffer.from(policyDocument, 'utf-8')
    }

    beforeEach(function () {
        iot = mock()
        node = new IotPolicyFolderNode(instance(iot), new IotNode(instance(iot)))
        policyObject = { Version: '2012-10-17', Statement: '' }
        policyDocument = JSON.stringify(policyObject)
        returnUndefined = false
    })

    it('prompts for policy name, creates policy, and shows success', async function () {
        const window = new FakeWindow({ inputBox: { input: policyName } })
        const commands = new FakeCommands()
        returnUndefined = false
        await createPolicyCommand(node, getPolicy, window, commands)

        assert.strictEqual(window.inputBox.options?.prompt, 'Enter a new policy name')
        assert.strictEqual(window.inputBox.options?.placeHolder, 'Policy Name')

        assert.strictEqual(window.message.information, 'Created Policy test-policy')

        verify(iot.createPolicy(deepEqual({ policyName, policyDocument }))).once()

        assert.strictEqual(commands.command, 'aws.refreshAwsExplorerNode')
        assert.deepStrictEqual(commands.args, [node])
    })

    it('does nothing when prompt is canceled', async function () {
        await createPolicyCommand(node, getPolicy, new FakeWindow(), new FakeCommands())

        verify(iot.createPolicy(anything())).never()
    })

    it('warns when policy name has invalid length', async function () {
        const window = new FakeWindow({ inputBox: { input: '' } })
        const commands = new FakeCommands()
        await createPolicyCommand(node, getPolicy, window, commands)

        assert.strictEqual(window.inputBox.errorMessage, 'Policy name must be between 1 and 128 characters long')
    })

    it('warns when policy name has invalid characters', async function () {
        const window = new FakeWindow({ inputBox: { input: 'illegal/characters' } })
        const commands = new FakeCommands()
        await createPolicyCommand(node, getPolicy, window, commands)

        assert.strictEqual(
            window.inputBox.errorMessage,
            'Policy name must contain only alphanumeric characters and/or the following: +=.,@-'
        )
    })

    it('does nothing when policy document is not read', async function () {
        returnUndefined = true
        const window = new FakeWindow({ inputBox: { input: policyName } })
        const commands = new FakeCommands()
        await createPolicyCommand(node, getPolicy, window, commands)

        verify(iot.createPolicy(anything())).never()
        assert.strictEqual(commands.command, undefined)
    })

    it('shows an error message when JSON is invalid', async function () {
        const window = new FakeWindow({ inputBox: { input: policyName } })
        const commands = new FakeCommands()
        returnUndefined = false
        policyDocument = 'not a JSON'
        await createPolicyCommand(node, getPolicy, window, commands)

        assert.ok(window.message.error?.includes('Failed to create policy test-policy'))

        verify(iot.createPolicy(anything())).never()

        assert.strictEqual(commands.command, undefined)
    })

    it('shows an error message if creating policy fails', async function () {
        returnUndefined = false
        when(iot.createPolicy(anything())).thenReject(new Error('Expected failure'))

        const window = new FakeWindow({ inputBox: { input: policyName } })
        const commands = new FakeCommands()
        await createPolicyCommand(node, getPolicy, window, commands)

        assert.ok(window.message.error?.includes('Failed to create policy test-policy'))

        assert.strictEqual(commands.command, undefined)
    })
})
