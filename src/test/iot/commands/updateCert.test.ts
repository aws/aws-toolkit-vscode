/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import {
    deactivateCertificateCommand,
    activateCertificateCommand,
    revokeCertificateCommand,
} from '../../../iot/commands/updateCert'
import { IotCertWithPoliciesNode } from '../../../iot/explorer/iotCertificateNode'
import { IotCertsFolderNode } from '../../../iot/explorer/iotCertFolderNode'
import { IotThingCertNode } from '../../../iot/explorer/iotCertificateNode'
import { IotThingNode } from '../../../iot/explorer/iotThingNode'
import { IotThingFolderNode } from '../../../iot/explorer/iotThingFolderNode'
import { IotNode } from '../../../iot/explorer/iotNodes'
import { IotClient } from '../../../shared/clients/iotClient'
import { FakeCommands } from '../../shared/vscode/fakeCommands'
import { FakeWindow } from '../../shared/vscode/fakeWindow'
import { anything, mock, instance, when, deepEqual, verify } from '../../utilities/mockito'
import globals from '../../../shared/extensionGlobals'

describe('updateCertificate', function () {
    const certificateId = 'test-cert'
    let iot: IotClient
    let node: IotCertWithPoliciesNode | IotThingCertNode
    let parentNode: IotCertsFolderNode
    let thingParentNode: IotThingNode

    beforeEach(function () {
        iot = mock()
    })

    describe('deactivateCommand', function () {
        this.beforeEach(function () {
            parentNode = new IotCertsFolderNode(instance(iot), new IotNode(instance(iot)))
            node = new IotCertWithPoliciesNode(
                { id: certificateId, arn: 'arn', activeStatus: 'ACTIVE', creationDate: new globals.clock.Date() },
                parentNode,
                instance(iot)
            )
        })

        it('confirms deactivation, deactivates cert, and refreshes tree', async function () {
            const window = new FakeWindow({ message: { warningSelection: 'Deactivate' } })
            const commands = new FakeCommands()
            await deactivateCertificateCommand(node, window, commands)

            assert.strictEqual(window.message.warning, 'Are you sure you want to deactivate certificate test-cert?')
            assert.strictEqual(window.message.information, 'Deactivated: test-cert')

            verify(iot.updateCertificate(deepEqual({ certificateId, newStatus: 'INACTIVE' }))).once()
        })

        it('does nothing when deactivation is cancelled', async function () {
            const window = new FakeWindow({ message: { warningSelection: 'Cancel' } })
            await deactivateCertificateCommand(node, window, new FakeCommands())

            verify(iot.updateCertificate(anything())).never()
        })

        it('shows an error message if deactivating the certificate fails', async function () {
            when(iot.updateCertificate(anything())).thenReject(new Error('Expected failure'))
            const window = new FakeWindow({ message: { warningSelection: 'Deactivate' } })
            const commands = new FakeCommands()
            await deactivateCertificateCommand(node, window, commands)

            assert.ok(window.message.error?.includes('Failed to deactivate: test-cert'))
        })
    })

    describe('activateCommand', function () {
        this.beforeEach(function () {
            thingParentNode = new IotThingNode(
                { name: 'iot-thing', arn: 'thingArn' },
                new IotThingFolderNode(instance(iot), new IotNode(instance(iot))),
                instance(iot)
            )
            node = new IotThingCertNode(
                { id: certificateId, arn: 'arn', activeStatus: 'INACTIVE', creationDate: new globals.clock.Date() },
                thingParentNode,
                instance(iot)
            )
        })

        it('confirms activation, activates cert, and refreshes tree', async function () {
            const window = new FakeWindow({ message: { warningSelection: 'Activate' } })
            const commands = new FakeCommands()
            await activateCertificateCommand(node, window, commands)

            assert.strictEqual(window.message.warning, 'Are you sure you want to activate certificate test-cert?')
            assert.strictEqual(window.message.information, 'Activated: test-cert')

            verify(iot.updateCertificate(deepEqual({ certificateId, newStatus: 'ACTIVE' }))).once()
        })

        it('does nothing when activation is cancelled', async function () {
            const window = new FakeWindow({ message: { warningSelection: 'Cancel' } })
            await activateCertificateCommand(node, window, new FakeCommands())

            verify(iot.updateCertificate(anything())).never()
        })

        it('shows an error message if deactivating the certificate fails', async function () {
            when(iot.updateCertificate(anything())).thenReject(new Error('Expected failure'))
            const window = new FakeWindow({ message: { warningSelection: 'Activate' } })
            const commands = new FakeCommands()
            await activateCertificateCommand(node, window, commands)

            assert.ok(window.message.error?.includes('Failed to activate: test-cert'))
        })
    })

    describe('revoke', function () {
        this.beforeEach(function () {
            parentNode = new IotCertsFolderNode(instance(iot), new IotNode(instance(iot)))
            node = new IotCertWithPoliciesNode(
                { id: certificateId, arn: 'arn', activeStatus: 'ACTIVE', creationDate: new globals.clock.Date() },
                parentNode,
                instance(iot)
            )
        })

        it('confirms revocation, revokes cert, and refreshes tree', async function () {
            const window = new FakeWindow({ message: { warningSelection: 'Revoke' } })
            const commands = new FakeCommands()
            await revokeCertificateCommand(node, window, commands)

            assert.strictEqual(window.message.warning, 'Are you sure you want to revoke certificate test-cert?')
            assert.strictEqual(window.message.information, 'Revoked: test-cert')

            verify(iot.updateCertificate(deepEqual({ certificateId, newStatus: 'REVOKED' }))).once()
        })

        it('does nothing when revocation is cancelled', async function () {
            const window = new FakeWindow({ message: { warningSelection: 'Cancel' } })
            await revokeCertificateCommand(node, window, new FakeCommands())

            verify(iot.updateCertificate(anything())).never()
        })

        it('shows an error message if revoking the certificate fails', async function () {
            when(iot.updateCertificate(anything())).thenReject(new Error('Expected failure'))
            const window = new FakeWindow({ message: { warningSelection: 'Revoke' } })
            const commands = new FakeCommands()
            await revokeCertificateCommand(node, window, commands)

            assert.ok(window.message.error?.includes('Failed to revoke: test-cert'))
        })
    })
})
