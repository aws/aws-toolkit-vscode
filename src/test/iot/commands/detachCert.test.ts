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
import { anything, mock, instance, when, deepEqual, verify } from '../../utilities/mockito'
import globals from '../../../shared/extensionGlobals'
import { getTestWindow } from '../../shared/vscode/window'

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

        iot = mock()
        parentNode = new IotThingNode({ name: thingName, arn: 'arn' }, {} as IotThingFolderNode, instance(iot))
        node = new IotThingCertNode(
            { id: certificateId, arn: principal, activeStatus: 'ACTIVE', creationDate: new globals.clock.Date() },
            parentNode,
            instance(iot)
        )
    })

    afterEach(function () {
        sandbox.restore()
    })

    it('confirms detach, detaches certificate, and refreshes node', async function () {
        getTestWindow().onDidShowMessage(m => m.items.find(i => i.title === 'Detach')?.select())
        await detachThingCertCommand(node)

        getTestWindow()
            .getFirstMessage()
            .assertWarn('Are you sure you want to detach certificate from Thing iot-thing?')

        verify(iot.detachThingPrincipal(deepEqual({ thingName, principal }))).once()

        sandbox.assert.calledWith(spyExecuteCommand, 'aws.refreshAwsExplorerNode', parentNode)
    })

    it('does nothing when cancelled', async function () {
        getTestWindow().onDidShowMessage(m => m.selectItem('Cancel'))
        await detachThingCertCommand(node)

        verify(iot.detachThingPrincipal(anything())).never()
    })

    it('shows an error message and refreshes node when thing detachment fails', async function () {
        when(iot.detachThingPrincipal(anything())).thenReject(new Error('Expected failure'))

        getTestWindow().onDidShowMessage(m => m.items.find(i => i.title === 'Detach')?.select())
        await detachThingCertCommand(node)

        getTestWindow()
            .getSecondMessage()
            .assertError(/Failed to detach: test-certificate/)

        sandbox.assert.calledWith(spyExecuteCommand, 'aws.refreshAwsExplorerNode', parentNode)
    })
})
