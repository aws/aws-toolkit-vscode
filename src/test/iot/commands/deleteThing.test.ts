/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { deleteThingCommand } from '../../../iot/commands/deleteThing'
import { IotThingFolderNode } from '../../../iot/explorer/iotThingFolderNode'
import { IotThingNode } from '../../../iot/explorer/iotThingNode'
import { IotNode } from '../../../iot/explorer/iotNodes'
import { IotClient } from '../../../shared/clients/iotClient'
import { anything, mock, instance, when, deepEqual, verify } from '../../utilities/mockito'
import { getTestWindow } from '../../shared/vscode/window'

describe('deleteThingCommand', function () {
    const thingName = 'iot-thing'
    let iot: IotClient
    let node: IotThingNode
    let parentNode: IotThingFolderNode
    let sandbox: sinon.SinonSandbox
    let spyExecuteCommand: sinon.SinonSpy

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        spyExecuteCommand = sandbox.spy(vscode.commands, 'executeCommand')

        iot = mock()
        parentNode = new IotThingFolderNode(instance(iot), new IotNode(instance(iot)))
        node = new IotThingNode({ name: thingName, arn: 'arn' }, parentNode, instance(iot))
    })

    afterEach(function () {
        sandbox.restore()
    })

    it('confirms deletion, deletes thing, and refreshes node', async function () {
        when(iot.listThingPrincipals(deepEqual({ thingName }))).thenResolve({ principals: [] })

        getTestWindow().onDidShowMessage(m => m.items.find(i => i.title === 'Delete')?.select())
        await deleteThingCommand(node)

        getTestWindow().getFirstMessage().assertWarn('Are you sure you want to delete Thing iot-thing?')

        verify(iot.deleteThing(deepEqual({ thingName }))).once()

        sandbox.assert.calledWith(spyExecuteCommand, 'aws.refreshAwsExplorerNode', parentNode)
    })

    it('does nothing if thing principals are attached', async function () {
        when(iot.listThingPrincipals(deepEqual({ thingName }))).thenResolve({ principals: ['string'] })

        getTestWindow().onDidShowMessage(m => m.items.find(i => i.title === 'Delete')?.select())
        await deleteThingCommand(node)

        getTestWindow()
            .getSecondMessage()
            .assertError(/Cannot delete Thing iot-thing/)

        sandbox.assert.notCalled(spyExecuteCommand)
    })

    it('does nothing when deletion is cancelled', async function () {
        getTestWindow().onDidShowMessage(m => m.selectItem('Cancel'))
        await deleteThingCommand(node)

        verify(iot.deleteThing(anything())).never()
    })

    it('shows an error message and refreshes node when thing deletion fails', async function () {
        when(iot.deleteThing(anything())).thenReject(new Error('Expected failure'))

        getTestWindow().onDidShowMessage(m => m.items.find(i => i.title === 'Delete')?.select())
        await deleteThingCommand(node)

        getTestWindow()
            .getSecondMessage()
            .assertError(/Failed to delete Thing: iot-thing/)

        sandbox.assert.calledWith(spyExecuteCommand, 'aws.refreshAwsExplorerNode', parentNode)
    })

    it('shows an error message and refreshes node if principals are not fetched', async function () {
        when(iot.listThingPrincipals(anything())).thenReject(new Error('Expected failure'))

        getTestWindow().onDidShowMessage(m => m.items.find(i => i.title === 'Delete')?.select())
        await deleteThingCommand(node)

        getTestWindow()
            .getSecondMessage()
            .assertError(/Failed to delete Thing: iot-thing/)

        sandbox.assert.calledWith(spyExecuteCommand, 'aws.refreshAwsExplorerNode', parentNode)
    })
})
