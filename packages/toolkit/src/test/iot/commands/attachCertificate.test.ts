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
import { DataQuickPickItem } from '../../../shared/ui/pickerPrompter'
import { PromptResult } from '../../../shared/ui/prompter'
import globals from '../../../shared/extensionGlobals'
import { getTestWindow } from '../../shared/vscode/window'
import assert from 'assert'

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

        iot = {} as any as IotClient
        thingNode = new IotThingNode({ name: thingName, arn: 'arn' }, {} as IotThingFolderNode, iot)
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
        const listStub = sinon.stub().resolves({ certificates: certs })
        iot.listCertificates = listStub
        const attachStub = sinon.stub()
        iot.attachThingPrincipal = attachStub
        await attachCertificateCommand(thingNode, prompt)

        assert(attachStub.calledOnceWithExactly({ thingName, principal: 'arn1' }))

        sandbox.assert.calledWith(spyExecuteCommand, 'aws.refreshAwsExplorerNode', thingNode)
    })

    it('shows an error message if certificates are not fetched', async function () {
        const listStub = sinon.stub().rejects(new Error('Expected failure'))
        iot.listCertificates = listStub
        const attachStub = sinon.stub()
        iot.attachThingPrincipal = attachStub

        selection = -1
        await attachCertificateCommand(thingNode, prompt)

        assert(attachStub.notCalled)

        getTestWindow()
            .getFirstMessage()
            .assertError(/Failed to retrieve certificate/)

        sandbox.assert.notCalled(spyExecuteCommand)
    })

    it('shows an error message if attaching certificate fails', async function () {
        selection = 1
        const listStub = sinon.stub().resolves({ certificates: certs })
        iot.listCertificates = listStub
        const attachStub = sinon.stub().rejects(new Error('Expected failure'))
        iot.attachThingPrincipal = attachStub

        await attachCertificateCommand(thingNode, prompt)

        getTestWindow()
            .getFirstMessage()
            .assertError(/Failed to attach certificate cert2/)

        sandbox.assert.notCalled(spyExecuteCommand)
    })

    it('Does nothing if no certificate is chosen', async function () {
        selection = -1
        const listStub = sinon.stub().resolves({ certificates: certs })
        iot.listCertificates = listStub
        const attachStub = sinon.stub().rejects(new Error('Expected failure'))
        iot.attachThingPrincipal = attachStub

        await attachCertificateCommand(thingNode, prompt)

        assert(attachStub.notCalled)

        sandbox.assert.notCalled(spyExecuteCommand)
    })
})
