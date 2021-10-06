/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { deleteThingCommand } from '../../../iot/commands/deleteThing'
import { IotThingFolderNode } from '../../../iot/explorer/iotThingFolderNode'
import { IotThingNode } from '../../../iot/explorer/iotThingNode'
import { IotNode } from '../../../iot/explorer/iotNodes'
import { IotClient } from '../../../shared/clients/iotClient'
import { FakeCommands } from '../../shared/vscode/fakeCommands'
import { FakeWindow } from '../../shared/vscode/fakeWindow'
import { anything, mock, instance, when, deepEqual, verify } from '../../utilities/mockito'

describe('deleteThingCommand', function () {
    const thingName = 'iot-thing'
    let iot: IotClient
    let node: IotThingNode
    let parentNode: IotThingFolderNode

    beforeEach(function () {
        iot = mock()
        parentNode = new IotThingFolderNode(instance(iot), new IotNode(instance(iot)))
        node = new IotThingNode({ name: thingName, arn: 'arn' }, parentNode, instance(iot))
    })

    it('confirms deletion, deletes thing, and refreshes node', async function () {
        when(iot.listThingPrincipals(deepEqual({ thingName }))).thenResolve({ principals: [] })

        const window = new FakeWindow({ message: { warningSelection: 'Delete' } })
        const commands = new FakeCommands()
        await deleteThingCommand(node, window, commands)

        assert.strictEqual(window.message.warning, 'Are you sure you want to delete Thing iot-thing?')

        verify(iot.deleteThing(deepEqual({ thingName }))).once()

        assert.strictEqual(commands.command, 'aws.refreshAwsExplorerNode')
        assert.deepStrictEqual(commands.args, [parentNode])
    })

    it('does nothing if thing principals are attached', async function () {
        when(iot.listThingPrincipals(deepEqual({ thingName }))).thenResolve({ principals: ['string'] })

        const window = new FakeWindow({ message: { warningSelection: 'Delete' } })
        const commands = new FakeCommands()
        await deleteThingCommand(node, window, commands)

        assert.ok(window.message.error?.includes('Failed to delete Thing iot-thing'))

        assert.strictEqual(commands.command, undefined)
    })

    it('does nothing when deletion is cancelled', async function () {
        const window = new FakeWindow({ message: { warningSelection: 'Cancel' } })
        await deleteThingCommand(node, window, new FakeCommands())

        verify(iot.deleteThing(anything())).never()
    })

    it('shows an error message and refreshes node when thing deletion fails', async function () {
        when(iot.deleteThing(anything())).thenReject(new Error('Expected failure'))

        const window = new FakeWindow({ message: { warningSelection: 'Delete' } })
        const commands = new FakeCommands()
        await deleteThingCommand(node, window, commands)

        assert.ok(window.message.error?.includes('Failed to delete Thing iot-thing'))

        assert.strictEqual(commands.command, 'aws.refreshAwsExplorerNode')
        assert.deepStrictEqual(commands.args, [parentNode])
    })

    it('shows an error message and refreshes node if principals are not fetched', async function () {
        when(iot.listThingPrincipals(anything())).thenReject(new Error('Expected failure'))

        const window = new FakeWindow({ message: { warningSelection: 'Delete' } })
        const commands = new FakeCommands()
        await deleteThingCommand(node, window, commands)

        assert.ok(window.message.error?.includes('Failed to delete Thing iot-thing'))

        assert.strictEqual(commands.command, 'aws.refreshAwsExplorerNode')
        assert.deepStrictEqual(commands.args, [parentNode])
    })
})
