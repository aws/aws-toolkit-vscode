/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as sinon from 'sinon'
import { Iot } from 'aws-sdk'
import { attachCertificateCommand, CertGen } from '../../../iot/commands/attachCertificate'
import { IotThingFolderNode } from '../../../iot/explorer/iotThingFolderNode'
import { IotThingNode } from '../../../iot/explorer/iotThingNode'
import { IotClient } from '../../../shared/clients/iotClient'
import { anything, mock, instance, when, deepEqual, verify } from '../../utilities/mockito'
import { DataQuickPickItem } from '../../../shared/ui/pickerPrompter'
import { PromptResult } from '../../../shared/ui/prompter'
import globals from '../../../shared/extensionGlobals'
import { getTestWindow } from '../../shared/vscode/window'

describe('attachCertCommand', function () {
    const thingName = 'iot-thing'
    let iot: IotClient
    let certs: Iot.Certificate[]
    let thingNode: IotThingNode
    let selection: number = 0
    let sandbox: sinon.SinonSandbox
    let spyExecuteCommand: sinon.SinonSpy

    const prompt: (iot: IotClient, certFetch: CertGen) => Promise<PromptResult<Iot.Certificate>> = async (
        iot,
        certFetch
    ) => {
        const iterable = certFetch(iot)
        const responses: DataQuickPickItem<Iot.Certificate>[] = []
        for await (const response of iterable) {
            responses.push(...response)
        }
        return selection > -1 ? (responses[selection].data as Iot.Certificate) : undefined
    }

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        spyExecuteCommand = sandbox.spy(vscode.commands, 'executeCommand')

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

    afterEach(function () {
        sandbox.restore()
    })

    it('attaches selected certificate', async function () {
        // const executeCommand = stubVscodeExecuteCommand()
        selection = 0
        when(iot.listCertificates(anything())).thenResolve({ certificates: certs })
        await attachCertificateCommand(thingNode, prompt)

        verify(iot.attachThingPrincipal(deepEqual({ thingName, principal: 'arn1' }))).once()

        sandbox.assert.calledWith(spyExecuteCommand, 'aws.refreshAwsExplorerNode', thingNode)
    })

    it('shows an error message if certificates are not fetched', async function () {
        when(iot.listCertificates(anything())).thenReject(new Error('Expected failure'))

        selection = -1
        await attachCertificateCommand(thingNode, prompt)

        verify(iot.attachThingPrincipal(anything())).never()

        getTestWindow()
            .getFirstMessage()
            .assertError(/Failed to retrieve certificate/)

        sandbox.assert.notCalled(spyExecuteCommand)
    })

    it('shows an error message if attaching certificate fails', async function () {
        selection = 1
        when(iot.listCertificates(anything())).thenResolve({ certificates: certs })
        when(iot.attachThingPrincipal(anything())).thenReject(new Error('Expected failure'))

        await attachCertificateCommand(thingNode, prompt)

        getTestWindow()
            .getFirstMessage()
            .assertError(/Failed to attach certificate cert2/)

        sandbox.assert.notCalled(spyExecuteCommand)
    })

    it('Does nothing if no certificate is chosen', async function () {
        selection = -1
        when(iot.listCertificates(anything())).thenResolve({ certificates: certs })

        await attachCertificateCommand(thingNode, prompt)

        verify(iot.attachThingPrincipal(anything())).never()

        sandbox.assert.notCalled(spyExecuteCommand)
    })
})
