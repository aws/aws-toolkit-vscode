/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { detachThingCertCommand } from '../../../iot/commands/detachCert'
import { IotThingFolderNode } from '../../../iot/explorer/iotThingFolderNode'
import { IotThingNode } from '../../../iot/explorer/iotThingNode'
import { IotThingCertNode } from '../../../iot/explorer/iotCertificateNode'
import { IotClient } from '../../../shared/clients/iotClient'
import globals from '../../../shared/extensionGlobals'
import { getTestWindow } from '../../shared/vscode/window'
import assert from 'assert'

describe('detachThingCertCommand', function () {
    const certificateId = 'test-certificate'
    const principal = 'cert:arn'
    const thingName = 'iot-thing'
    let iot: IotClient
    let node: IotThingCertNode
    let parentNode: IotThingNode

    let sandbox: sinon.SinonSandbox
    let spyExecuteCommand: sinon.SinonSpy

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        spyExecuteCommand = sandbox.spy(vscode.commands, 'executeCommand')

        iot = {} as any as IotClient
        parentNode = new IotThingNode({ name: thingName, arn: 'arn' }, {} as IotThingFolderNode, iot)
        node = new IotThingCertNode(
            { id: certificateId, arn: principal, activeStatus: 'ACTIVE', creationDate: new globals.clock.Date() },
            parentNode,
            iot
        )
    })

    afterEach(function () {
        sandbox.restore()
    })

    it('confirms detach, detaches certificate, and refreshes node', async function () {
        const stub = sinon.stub()
        iot.detachThingPrincipal = stub
        getTestWindow().onDidShowMessage(m => m.items.find(i => i.title === 'Detach')?.select())
        await detachThingCertCommand(node)

        getTestWindow()
            .getFirstMessage()
            .assertWarn('Are you sure you want to detach certificate from Thing iot-thing?')

        assert(stub.calledOnceWithExactly({ thingName, principal }))

        sandbox.assert.calledWith(spyExecuteCommand, 'aws.refreshAwsExplorerNode', parentNode)
    })

    it('does nothing when cancelled', async function () {
        const stub = sinon.stub()
        iot.detachThingPrincipal = stub
        getTestWindow().onDidShowMessage(m => m.selectItem('Cancel'))
        await detachThingCertCommand(node)

        assert(stub.notCalled)
    })

    it('shows an error message and refreshes node when thing detachment fails', async function () {
        const stub = sinon.stub().rejects()
        iot.detachThingPrincipal = stub

        getTestWindow().onDidShowMessage(m => m.items.find(i => i.title === 'Detach')?.select())
        await detachThingCertCommand(node)

        getTestWindow()
            .getSecondMessage()
            .assertError(/Failed to detach: test-certificate/)

        sandbox.assert.calledWith(spyExecuteCommand, 'aws.refreshAwsExplorerNode', parentNode)
    })
})
