/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { Certificate } from "@aws-sdk/client-iot";
import { attachCertificateCommand, CertGen } from '../../../iot/commands/attachCertificate'
import { IotThingFolderNode } from '../../../iot/explorer/iotThingFolderNode'
import { IotThingNode } from '../../../iot/explorer/iotThingNode'
import { IotClient } from '../../../shared/clients/iotClient'
import { anything, mock, instance, when, deepEqual, verify } from '../../utilities/mockito'
import { FakeCommands } from '../../shared/vscode/fakeCommands'
import { DataQuickPickItem } from '../../../shared/ui/pickerPrompter'
import { PromptResult } from '../../../shared/ui/prompter'
import globals from '../../../shared/extensionGlobals'
import { getTestWindow } from '../../shared/vscode/window'

describe('attachCertCommand', function () {
    const thingName = 'iot-thing'
    let iot: IotClient
    let certs: Certificate[]
    let thingNode: IotThingNode
    let selection: number = 0

    const prompt: (iot: IotClient, certFetch: CertGen) => Promise<PromptResult<Certificate>> = async (
        iot,
        certFetch
    ) => {
        const iterable = certFetch(iot)
        const responses: DataQuickPickItem<Certificate>[] = []
        for await (const response of iterable) {
            responses.push(...response)
        }
        return selection > -1 ? (responses[selection].data as Certificate) : undefined;
    }

    beforeEach(function () {
        iot = mock()
        thingNode = new IotThingNode({ name: thingName, arn: 'arn' }, {} as IotThingFolderNode, instance(iot))
        certs = [
            {
                certificateId: 'cert1',
                certificateArn: 'arn1',
                status: 'ACTIVE',
                creationDate: new globals.clock.Date(),
            },
            {
                certificateId: 'cert2',
                certificateArn: 'arn2',
                status: 'INACTIVE',
                creationDate: new globals.clock.Date(),
            },
            { certificateId: 'cert3', certificateArn: 'arn3', status: 'ACTIVE' },
        ]
    })

    it('attaches selected certificate', async function () {
        selection = 0
        const commands = new FakeCommands()
        when(iot.listCertificates(anything())).thenResolve({ certificates: certs })
        await attachCertificateCommand(thingNode, prompt, commands)

        verify(iot.attachThingPrincipal(deepEqual({ thingName, principal: 'arn1' }))).once()

        assert.strictEqual(commands.command, 'aws.refreshAwsExplorerNode')
        assert.deepStrictEqual(commands.args, [thingNode])
    })

    it('shows an error message if certificates are not fetched', async function () {
        when(iot.listCertificates(anything())).thenReject(new Error('Expected failure'))

        selection = -1
        const commands = new FakeCommands()
        await attachCertificateCommand(thingNode, prompt, commands)

        verify(iot.attachThingPrincipal(anything())).never()

        getTestWindow()
            .getFirstMessage()
            .assertError(/Failed to retrieve certificate/)

        assert.strictEqual(commands.command, undefined)
    })

    it('shows an error message if attaching certificate fails', async function () {
        selection = 1
        when(iot.listCertificates(anything())).thenResolve({ certificates: certs })
        when(iot.attachThingPrincipal(anything())).thenReject(new Error('Expected failure'))

        const commands = new FakeCommands()
        await attachCertificateCommand(thingNode, prompt, commands)

        getTestWindow()
            .getFirstMessage()
            .assertError(/Failed to attach certificate cert2/)

        assert.strictEqual(commands.command, undefined)
    })

    it('Does nothing if no certificate is chosen', async function () {
        selection = -1
        when(iot.listCertificates(anything())).thenResolve({ certificates: certs })

        const commands = new FakeCommands()
        await attachCertificateCommand(thingNode, prompt, commands)

        verify(iot.attachThingPrincipal(anything())).never()

        assert.strictEqual(commands.command, undefined)
    })
})
