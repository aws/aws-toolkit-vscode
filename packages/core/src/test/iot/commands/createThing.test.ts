/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { createThingCommand } from '../../../iot/commands/createThing'
import { IotThingFolderNode } from '../../../iot/explorer/iotThingFolderNode'
import { IotNode } from '../../../iot/explorer/iotNodes'
import { IotClient } from '../../../shared/clients/iotClient'
import { getTestWindow } from '../../shared/vscode/window'

describe('createThingCommand', function () {
    const thingName = 'newIotThing'
    let iot: IotClient
    let node: IotThingFolderNode
    let sandbox: sinon.SinonSandbox
    let spyExecuteCommand: sinon.SinonSpy

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        spyExecuteCommand = sandbox.spy(vscode.commands, 'executeCommand')

        iot = {} as any as IotClient
        node = new IotThingFolderNode(iot, new IotNode(iot))
    })

    afterEach(function () {
        sandbox.restore()
    })

    it('prompts for thing name, creates thing, shows success, and refreshes node', async function () {
        const createStub = sinon.stub().resolves({
            thingName: thingName,
        })
        iot.createThing = createStub

        getTestWindow().onDidShowInputBox(input => {
            assert.strictEqual(input.prompt, 'Enter a new Thing name')
            assert.strictEqual(input.placeholder, 'Thing Name')
            input.acceptValue(thingName)
        })
        await createThingCommand(node)

        getTestWindow()
            .getFirstMessage()
            .assertInfo(/Created Thing newIotThing/)

        assert(createStub.calledOnceWithExactly({ thingName }))
        sandbox.assert.calledWith(spyExecuteCommand, 'aws.refreshAwsExplorerNode', node)
    })

    it('does nothing when prompt is cancelled', async function () {
        const createStub = sinon.stub()
        iot.createThing = createStub
        getTestWindow().onDidShowInputBox(input => input.hide())
        await createThingCommand(node)

        assert(createStub.notCalled)
    })

    it('warns when thing name has invalid length', async function () {
        getTestWindow().onDidShowInputBox(input => {
            input.acceptValue('')
            assert.strictEqual(input.validationMessage, 'Thing name must be between 1 and 128 characters long')
            input.hide()
        })
        await createThingCommand(node)
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
        await createThingCommand(node)
    })

    it('shows an error message and refreshes node when thing creation fails', async function () {
        const createStub = sinon.stub().rejects()
        iot.createThing = createStub

        getTestWindow().onDidShowInputBox(input => input.acceptValue(thingName))
        await createThingCommand(node)

        getTestWindow()
            .getFirstMessage()
            .assertError(/Failed to create Thing/)

        sandbox.assert.calledWith(spyExecuteCommand, 'aws.refreshAwsExplorerNode', node)
    })
})
