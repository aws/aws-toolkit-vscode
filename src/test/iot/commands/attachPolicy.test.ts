/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { Iot } from 'aws-sdk'
import { attachPolicyCommand, PolicyGen } from '../../../iot/commands/attachPolicy'
import { IotCertsFolderNode } from '../../../iot/explorer/iotCertFolderNode'
import { IotCertWithPoliciesNode } from '../../../iot/explorer/iotCertificateNode'
import { IotClient } from '../../../shared/clients/iotClient'
import { FakeWindow } from '../../shared/vscode/fakeWindow'
import { anything, mock, instance, when, deepEqual, verify } from '../../utilities/mockito'
import { FakeCommands } from '../../shared/vscode/fakeCommands'
import { DataQuickPickItem } from '../../../shared/ui/pickerPrompter'
import { PromptResult } from '../../../shared/ui/prompter'
import { Window } from '../../../shared/vscode/window'

describe('attachPolicyCommand', function () {
    const certId = 'iot-certificate'
    let iot: IotClient
    let policies: Iot.Policy[]
    let certNode: IotCertWithPoliciesNode
    let window: FakeWindow
    let selection: number = 0
    const prompt: (iot: IotClient, policyFetch: PolicyGen, window?: Window) => Promise<PromptResult<Iot.Policy>> =
        async (iot, policyFetch) => {
            const iterable = policyFetch(iot, window)
            const responses: DataQuickPickItem<Iot.Policy>[] = []
            for await (const response of iterable) {
                responses.push(...response)
            }
            return selection > -1 ? (responses[selection].data as Iot.Policy) : undefined
        }

    beforeEach(function () {
        iot = mock()
        certNode = new IotCertWithPoliciesNode(
            { id: certId, arn: 'arn', activeStatus: 'ACTIVE', creationDate: new Date() },
            {} as IotCertsFolderNode,
            instance(iot)
        )
        policies = [
            { policyName: 'policy1', policyArn: 'arn1' },
            { policyName: 'policy2', policyArn: 'arn2' },
        ]
        window = new FakeWindow()
    })

    it('attaches selected policy', async function () {
        selection = 0
        const commands = new FakeCommands()
        when(iot.listPolicies(anything())).thenResolve({ policies })
        await attachPolicyCommand(certNode, prompt, window, commands)

        verify(iot.attachPolicy(deepEqual({ policyName: 'policy1', target: 'arn' }))).once()

        assert.strictEqual(commands.command, 'aws.refreshAwsExplorerNode')
        assert.deepStrictEqual(commands.args, [certNode])
    })

    it('shows an error message if policies are not fetched', async function () {
        when(iot.listPolicies(anything())).thenReject(new Error('Expected failure'))

        selection = -1
        const commands = new FakeCommands()
        await attachPolicyCommand(certNode, prompt, window, commands)

        verify(iot.attachPolicy(anything())).never()

        assert.ok(window.message.error?.includes('Failed to retrieve policies'))

        assert.strictEqual(commands.command, undefined)
    })

    it('shows an error message if attaching policy fails', async function () {
        selection = 1
        when(iot.listPolicies(anything())).thenResolve({ policies })
        when(iot.attachPolicy(anything())).thenReject(new Error('Expected failure'))

        const commands = new FakeCommands()
        await attachPolicyCommand(certNode, prompt, window, commands)

        assert.ok(window.message.error?.includes('Failed to attach policy policy2'))

        assert.strictEqual(commands.command, undefined)
    })

    it('Does nothing if no policy is chosen', async function () {
        selection = -1
        when(iot.listPolicies(anything())).thenResolve({ policies })

        const commands = new FakeCommands()
        await attachPolicyCommand(certNode, prompt, window, commands)

        verify(iot.attachPolicy(anything())).never()

        assert.strictEqual(commands.command, undefined)
    })
})
