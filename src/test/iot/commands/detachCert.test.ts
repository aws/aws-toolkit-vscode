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
import { FakeWindow } from '../../shared/vscode/fakeWindow'
import { anything, mock, instance, when, deepEqual, verify } from '../../utilities/mockito'

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
            { id: certificateId, arn: principal, activeStatus: 'ACTIVE', creationDate: new Date() },
            parentNode,
            instance(iot)
        )
    })

    it('confirms detach, detaches certificate, and refreshes node', async function () {
        const window = new FakeWindow({ message: { warningSelection: 'Detach' } })
        const commands = new FakeCommands()
        await detachThingCertCommand(node, window, commands)

        assert.strictEqual(window.message.warning, 'Are you sure you want to detach certificate from Thing iot-thing?')

        verify(iot.detachThingPrincipal(deepEqual({ thingName, principal }))).once()

        assert.strictEqual(commands.command, 'aws.refreshAwsExplorerNode')
        assert.deepStrictEqual(commands.args, [parentNode])
    })

    it('does nothing when cancelled', async function () {
        const window = new FakeWindow({ message: { warningSelection: 'Cancel' } })
        await detachThingCertCommand(node, window, new FakeCommands())

        verify(iot.detachThingPrincipal(anything())).never()
    })

    it('shows an error message and refreshes node when thing detachment fails', async function () {
        when(iot.detachThingPrincipal(anything())).thenReject(new Error('Expected failure'))

        const window = new FakeWindow({ message: { warningSelection: 'Detach' } })
        const commands = new FakeCommands()
        await detachThingCertCommand(node, window, commands)

        assert.ok(window.message.error?.includes('Failed to detach test-certificate'))

        assert.strictEqual(commands.command, 'aws.refreshAwsExplorerNode')
        assert.deepStrictEqual(commands.args, [parentNode])
    })
})
