/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { createPolicyVersionCommand } from '../../../iot/commands/createPolicyVersion'
import { IotNode } from '../../../iot/explorer/iotNodes'
import { IotClient } from '../../../shared/clients/iotClient'
import { FakeWindow } from '../../shared/vscode/fakeWindow'
import { anything, mock, instance, when, deepEqual, verify } from '../../utilities/mockito'
import { FakeCommands } from '../../shared/vscode/fakeCommands'
import { Window } from '../../../shared/vscode/window'
import { IotPolicyFolderNode } from '../../../iot/explorer/iotPolicyFolderNode'
import { IotPolicyWithVersionsNode } from '../../../iot/explorer/iotPolicyNode'

describe('createPolicyVersionCommand', function () {
    const policyName = 'test-policy'
    let iot: IotClient
    let policyObject: any
    let policyDocument: string
    let node: IotPolicyWithVersionsNode
    let parentNode: IotPolicyFolderNode
    let window: FakeWindow
    let returnUndefined: boolean = false
    const getPolicy: (window: Window) => Promise<Buffer | undefined> = async window => {
        if (returnUndefined) {
            return undefined
        }
        return Buffer.from(policyDocument, 'utf-8')
    }

    beforeEach(function () {
        iot = mock()
        parentNode = new IotPolicyFolderNode(instance(iot), new IotNode(instance(iot)))
        node = new IotPolicyWithVersionsNode({ name: policyName, arn: 'arn' }, parentNode, instance(iot))
        window = new FakeWindow()
        policyObject = { Version: '2012-10-17', Statement: '' }
        policyDocument = JSON.stringify(policyObject)
        returnUndefined = false
    })

    it('creates new policy version and shows success', async function () {
        const commands = new FakeCommands()
        returnUndefined = false
        await createPolicyVersionCommand(node, getPolicy, window, commands)

        assert.strictEqual(window.message.information, 'Created new version of test-policy')

        verify(iot.createPolicyVersion(deepEqual({ policyName, policyDocument, setAsDefault: true }))).once()
    })

    it('does nothing when policy document is not read', async function () {
        returnUndefined = true
        const commands = new FakeCommands()
        await createPolicyVersionCommand(node, getPolicy, window, commands)

        verify(iot.createPolicyVersion(anything())).never()
    })

    it('shows an error message when JSON is invalid', async function () {
        const commands = new FakeCommands()
        returnUndefined = false
        policyDocument = 'not a JSON'
        await createPolicyVersionCommand(node, getPolicy, window, commands)

        assert.ok(window.message.error?.includes('Failed to create new version of test-policy'))

        verify(iot.createPolicyVersion(anything())).never()
    })

    it('shows an error message if creating version fails', async function () {
        returnUndefined = false
        when(iot.createPolicyVersion(anything())).thenReject(new Error('Expected failure'))

        const commands = new FakeCommands()
        await createPolicyVersionCommand(node, getPolicy, window, commands)

        assert.ok(window.message.error?.includes('Failed to create new version of test-policy'))
    })
})
