/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

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
import { anything, mock, instance, when, deepEqual, verify } from '../../utilities/mockito'
import globals from '../../../shared/extensionGlobals'
import { getTestWindow } from '../../shared/vscode/window'

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
            getTestWindow().onDidShowMessage(m => m.items.find(i => i.title === 'Deactivate')?.select())
            await deactivateCertificateCommand(node)

            getTestWindow().getFirstMessage().assertWarn('Are you sure you want to deactivate certificate test-cert?')
            getTestWindow().getSecondMessage().assertInfo('Deactivated: test-cert')

            verify(iot.updateCertificate(deepEqual({ certificateId, newStatus: 'INACTIVE' }))).once()
        })

        it('does nothing when deactivation is cancelled', async function () {
            getTestWindow().onDidShowMessage(m => m.selectItem('Cancel'))
            await deactivateCertificateCommand(node)

            verify(iot.updateCertificate(anything())).never()
        })

        it('shows an error message if deactivating the certificate fails', async function () {
            when(iot.updateCertificate(anything())).thenReject(new Error('Expected failure'))
            getTestWindow().onDidShowMessage(m => m.items.find(i => i.title === 'Deactivate')?.select())
            await deactivateCertificateCommand(node)

            getTestWindow()
                .getSecondMessage()
                .assertError(/Failed to deactivate: test-cert/)
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
            getTestWindow().onDidShowMessage(m => m.items.find(i => i.title === 'Activate')?.select())
            await activateCertificateCommand(node)

            getTestWindow().getFirstMessage().assertWarn('Are you sure you want to activate certificate test-cert?')
            getTestWindow()
                .getSecondMessage()
                .assertInfo(/Activated: test-cert/)

            verify(iot.updateCertificate(deepEqual({ certificateId, newStatus: 'ACTIVE' }))).once()
        })

        it('does nothing when activation is cancelled', async function () {
            getTestWindow().onDidShowMessage(m => m.selectItem('Cancel'))
            await activateCertificateCommand(node)

            verify(iot.updateCertificate(anything())).never()
        })

        it('shows an error message if deactivating the certificate fails', async function () {
            when(iot.updateCertificate(anything())).thenReject(new Error('Expected failure'))
            getTestWindow().onDidShowMessage(m => m.items.find(i => i.title === 'Activate')?.select())
            await activateCertificateCommand(node)

            getTestWindow()
                .getSecondMessage()
                .assertError(/Failed to activate: test-cert/)
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
            getTestWindow().onDidShowMessage(m => m.items.find(i => i.title === 'Revoke')?.select())
            await revokeCertificateCommand(node)

            getTestWindow().getFirstMessage().assertWarn('Are you sure you want to revoke certificate test-cert?')
            getTestWindow()
                .getSecondMessage()
                .assertInfo(/Revoked: test-cert/)

            verify(iot.updateCertificate(deepEqual({ certificateId, newStatus: 'REVOKED' }))).once()
        })

        it('does nothing when revocation is cancelled', async function () {
            getTestWindow().onDidShowMessage(m => m.selectItem('Cancel'))
            await revokeCertificateCommand(node)

            verify(iot.updateCertificate(anything())).never()
        })

        it('shows an error message if revoking the certificate fails', async function () {
            when(iot.updateCertificate(anything())).thenReject(new Error('Expected failure'))
            getTestWindow().onDidShowMessage(m => m.items.find(i => i.title === 'Revoke')?.select())
            await revokeCertificateCommand(node)

            getTestWindow()
                .getSecondMessage()
                .assertError(/Failed to revoke: test-cert/)
        })
    })
})
