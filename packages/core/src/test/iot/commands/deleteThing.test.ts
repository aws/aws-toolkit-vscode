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
import { getTestWindow } from '../../shared/vscode/window'
import assert from 'assert'

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

        iot = {} as any as IotClient
        parentNode = new IotThingFolderNode(iot, new IotNode(iot))
        node = new IotThingNode({ name: thingName, arn: 'arn' }, parentNode, iot)
    })

    afterEach(function () {
        sandbox.restore()
    })

    it('confirms deletion, deletes thing, and refreshes node', async function () {
        const listStub = sinon.stub().resolves({ principals: [] })
        iot.listThingPrincipals = listStub
        const deleteStub = sinon.stub()
        iot.deleteThing = deleteStub

        getTestWindow().onDidShowMessage(m => m.items.find(i => i.title === 'Delete')?.select())
        await deleteThingCommand(node)

        getTestWindow().getFirstMessage().assertWarn('Are you sure you want to delete Thing iot-thing?')

        assert(listStub.calledOnceWithExactly({ thingName }))
        assert(deleteStub.calledOnceWithExactly({ thingName }))

        sandbox.assert.calledWith(spyExecuteCommand, 'aws.refreshAwsExplorerNode', parentNode)
    })

    it('does nothing if thing principals are attached', async function () {
        const listStub = sinon.stub().resolves({ principals: ['string'] })
        iot.listThingPrincipals = listStub

        getTestWindow().onDidShowMessage(m => m.items.find(i => i.title === 'Delete')?.select())
        await deleteThingCommand(node)

        getTestWindow()
            .getSecondMessage()
            .assertError(/Cannot delete Thing iot-thing/)

        assert(listStub.calledOnceWithExactly({ thingName }))
        sandbox.assert.notCalled(spyExecuteCommand)
    })

    it('does nothing when deletion is cancelled', async function () {
        const deleteStub = sinon.stub()
        iot.deleteThing = deleteStub
        getTestWindow().onDidShowMessage(m => m.selectItem('Cancel'))
        await deleteThingCommand(node)

        assert(deleteStub.notCalled)
    })

    it('shows an error message and refreshes node when thing deletion fails', async function () {
        const deleteStub = sinon.stub().rejects()
        iot.deleteThing = deleteStub

        getTestWindow().onDidShowMessage(m => m.items.find(i => i.title === 'Delete')?.select())
        await deleteThingCommand(node)

        getTestWindow()
            .getSecondMessage()
            .assertError(/Failed to delete Thing: iot-thing/)

        sandbox.assert.calledWith(spyExecuteCommand, 'aws.refreshAwsExplorerNode', parentNode)
    })

    it('shows an error message and refreshes node if principals are not fetched', async function () {
        const listStub = sinon.stub().rejects()
        iot.listThingPrincipals = listStub

        getTestWindow().onDidShowMessage(m => m.items.find(i => i.title === 'Delete')?.select())
        await deleteThingCommand(node)

        getTestWindow()
            .getSecondMessage()
            .assertError(/Failed to delete Thing: iot-thing/)

        sandbox.assert.calledWith(spyExecuteCommand, 'aws.refreshAwsExplorerNode', parentNode)
    })
})
