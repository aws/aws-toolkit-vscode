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
import { anything, mock, instance, when, deepEqual, verify } from '../../utilities/mockito'
import { getTestWindow } from '../../shared/vscode/window'

describe('createThingCommand', function () {
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

        getTestWindow().onDidShowInputBox(input => {
            assert.strictEqual(input.prompt, 'Enter a new Thing name')
            assert.strictEqual(input.placeholder, 'Thing Name')
            input.acceptValue(thingName)
        })
        const commands = new FakeCommands()
        await createThingCommand(node, commands)

        getTestWindow()
            .getFirstMessage()
            .assertInfo(/Created Thing newIotThing/)

        assert.strictEqual(commands.command, 'aws.refreshAwsExplorerNode')
        assert.deepStrictEqual(commands.args, [node])
    })

    it('does nothing when prompt is cancelled', async function () {
        getTestWindow().onDidShowInputBox(input => input.hide())
        await createThingCommand(node, new FakeCommands())

        verify(iot.createThing(anything())).never()
    })

    it('warns when thing name has invalid length', async function () {
        getTestWindow().onDidShowInputBox(input => {
            input.acceptValue('')
            assert.strictEqual(input.validationMessage, 'Thing name must be between 1 and 128 characters long')
            input.hide()
        })
        const commands = new FakeCommands()
        await createThingCommand(node, commands)
    })

    it('warns when thing name has invalid characters', async function () {
        getTestWindow().onDidShowInputBox(input => {
            input.acceptValue('illegal/characters')
            assert.strictEqual(
                input.validationMessage,
                'Thing name must only contain alphanumeric characters, hyphens, underscores, or colons'
            )
            input.hide()
        })
        const commands = new FakeCommands()
        await createThingCommand(node, commands)
    })

    it('shows an error message and refreshes node when thing creation fails', async function () {
        when(iot.createThing(anything())).thenReject(new Error('Expected failure'))

        getTestWindow().onDidShowInputBox(input => input.acceptValue(thingName))
        const commands = new FakeCommands()
        await createThingCommand(node, commands)

        getTestWindow()
            .getFirstMessage()
            .assertError(/Failed to create Thing/)

        assert.strictEqual(commands.command, 'aws.refreshAwsExplorerNode')
        assert.deepStrictEqual(commands.args, [node])
    })
})
