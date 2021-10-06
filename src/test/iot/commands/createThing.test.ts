/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { createThingCommand } from '../../../iot/commands/createThing'
import { IotThingFolderNode } from '../../../iot/explorer/iotThingFolderNode'
import { IotNode } from '../../../iot/explorer/iotNodes'
import { IotClient } from '../../../shared/clients/iotClient'
import { FakeCommands } from '../../shared/vscode/fakeCommands'
import { FakeWindow } from '../../shared/vscode/fakeWindow'
import { anything, mock, instance, when, deepEqual, verify } from '../../utilities/mockito'

describe('createBucketCommand', function () {
    const thingName = 'newIotThing'
    let iot: IotClient
    let node: IotThingFolderNode

    beforeEach(function () {
        iot = mock()
        node = new IotThingFolderNode(instance(iot), new IotNode(instance(iot)))
    })

    it('prompts for thing name, creates thing, shows success, and refreshes node', async function () {
        when(iot.createThing(deepEqual({ thingName }))).thenResolve({
            thingName: thingName,
        })

        const window = new FakeWindow({ inputBox: { input: thingName } })
        const commands = new FakeCommands()
        await createThingCommand(node, window, commands)

        assert.strictEqual(window.inputBox.options?.prompt, 'Enter a new Thing name')
        assert.strictEqual(window.inputBox.options?.placeHolder, 'Thing Name')

        assert.strictEqual(window.message.information, 'Created Thing newIotThing')

        assert.strictEqual(commands.command, 'aws.refreshAwsExplorerNode')
        assert.deepStrictEqual(commands.args, [node])
    })

    it('does nothing when prompt is cancelled', async function () {
        await createThingCommand(node, new FakeWindow(), new FakeCommands())

        verify(iot.createThing(anything())).never()
    })

    it('shows an error message and refreshes node when thing creation fails', async function () {
        when(iot.createThing(anything())).thenReject(new Error('Expected failure'))

        const window = new FakeWindow({ inputBox: { input: thingName } })
        const commands = new FakeCommands()
        await createThingCommand(node, window, commands)

        assert.ok(window.message.error?.includes('Failed to create Thing'))

        assert.strictEqual(commands.command, 'aws.refreshAwsExplorerNode')
        assert.deepStrictEqual(commands.args, [node])
    })
})
