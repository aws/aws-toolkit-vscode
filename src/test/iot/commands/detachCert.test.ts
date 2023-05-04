/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { detachThingCertCommand } from '../../../iot/commands/detachCert'
import { IotThingFolderNode } from '../../../iot/explorer/iotThingFolderNode'
import { IotThingNode } from '../../../iot/explorer/iotThingNode'
import { IotThingCertNode } from '../../../iot/explorer/iotCertificateNode'
import { IotClient } from '../../../shared/clients/iotClient'
import { FakeCommands } from '../../shared/vscode/fakeCommands'
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

    beforeEach(function () {
        iot = mock()
        parentNode = new IotThingNode({ name: thingName, arn: 'arn' }, {} as IotThingFolderNode, instance(iot))
        node = new IotThingCertNode(
            { id: certificateId, arn: principal, activeStatus: 'ACTIVE', creationDate: new globals.clock.Date() },
            parentNode,
            instance(iot)
        )
    })

    it('confirms detach, detaches certificate, and refreshes node', async function () {
        getTestWindow().onDidShowMessage(m => m.items.find(i => i.title === 'Detach')?.select())
        const commands = new FakeCommands()
        await detachThingCertCommand(node, commands)

        getTestWindow()
            .getFirstMessage()
            .assertWarn('Are you sure you want to detach certificate from Thing iot-thing?')

        verify(iot.detachThingPrincipal(deepEqual({ thingName, principal }))).once()

        assert.strictEqual(commands.command, 'aws.refreshAwsExplorerNode')
        assert.deepStrictEqual(commands.args, [parentNode])
    })

    it('does nothing when cancelled', async function () {
        getTestWindow().onDidShowMessage(m => m.selectItem('Cancel'))
        await detachThingCertCommand(node, new FakeCommands())

        verify(iot.detachThingPrincipal(anything())).never()
    })

    it('shows an error message and refreshes node when thing detachment fails', async function () {
        when(iot.detachThingPrincipal(anything())).thenReject(new Error('Expected failure'))

        getTestWindow().onDidShowMessage(m => m.items.find(i => i.title === 'Detach')?.select())
        const commands = new FakeCommands()
        await detachThingCertCommand(node, commands)

        getTestWindow()
            .getSecondMessage()
            .assertError(/Failed to detach: test-certificate/)

        assert.strictEqual(commands.command, 'aws.refreshAwsExplorerNode')
        assert.deepStrictEqual(commands.args, [parentNode])
    })
})
