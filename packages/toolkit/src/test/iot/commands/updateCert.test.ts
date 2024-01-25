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
import globals from '../../../shared/extensionGlobals'
import { getTestWindow } from '../../shared/vscode/window'
import sinon from 'sinon'
import assert from 'assert'

describe('updateCertificate', function () {
    const certificateId = 'test-cert'
    let iot: IotClient
    let node: IotCertWithPoliciesNode | IotThingCertNode
    let parentNode: IotCertsFolderNode
    let thingParentNode: IotThingNode

    beforeEach(function () {
        iot = {} as any as IotClient
    })

    describe('deactivateCommand', function () {
        this.beforeEach(function () {
            parentNode = new IotCertsFolderNode(iot, new IotNode(iot))
            node = new IotCertWithPoliciesNode(
                { id: certificateId, arn: 'arn', activeStatus: 'ACTIVE', creationDate: new globals.clock.Date() },
                parentNode,
                iot
            )
        })

        it('confirms deactivation, deactivates cert, and refreshes tree', async function () {
            const stub = sinon.stub()
            iot.updateCertificate = stub
            getTestWindow().onDidShowMessage(m => m.items.find(i => i.title === 'Deactivate')?.select())
            await deactivateCertificateCommand(node)

            getTestWindow().getFirstMessage().assertWarn('Are you sure you want to deactivate certificate test-cert?')
            getTestWindow().getSecondMessage().assertInfo('Deactivated: test-cert')

            assert(stub.calledOnceWithExactly({ certificateId, newStatus: 'INACTIVE' }))
        })

        it('does nothing when deactivation is cancelled', async function () {
            const stub = sinon.stub()
            iot.updateCertificate = stub
            getTestWindow().onDidShowMessage(m => m.selectItem('Cancel'))
            await deactivateCertificateCommand(node)

            assert(stub.notCalled)
        })

        it('shows an error message if deactivating the certificate fails', async function () {
            const stub = sinon.stub().rejects()
            iot.updateCertificate = stub
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
                new IotThingFolderNode(iot, new IotNode(iot)),
                iot
            )
            node = new IotThingCertNode(
                { id: certificateId, arn: 'arn', activeStatus: 'INACTIVE', creationDate: new globals.clock.Date() },
                thingParentNode,
                iot
            )
        })

        it('confirms activation, activates cert, and refreshes tree', async function () {
            const stub = sinon.stub()
            iot.updateCertificate = stub
            getTestWindow().onDidShowMessage(m => m.items.find(i => i.title === 'Activate')?.select())
            await activateCertificateCommand(node)

            getTestWindow().getFirstMessage().assertWarn('Are you sure you want to activate certificate test-cert?')
            getTestWindow()
                .getSecondMessage()
                .assertInfo(/Activated: test-cert/)

            assert(stub.calledOnceWithExactly({ certificateId, newStatus: 'ACTIVE' }))
        })

        it('does nothing when activation is cancelled', async function () {
            const stub = sinon.stub()
            iot.updateCertificate = stub
            getTestWindow().onDidShowMessage(m => m.selectItem('Cancel'))
            await activateCertificateCommand(node)

            assert(stub.notCalled)
        })

        it('shows an error message if deactivating the certificate fails', async function () {
            const stub = sinon.stub().rejects()
            iot.updateCertificate = stub
            getTestWindow().onDidShowMessage(m => m.items.find(i => i.title === 'Activate')?.select())
            await activateCertificateCommand(node)

            getTestWindow()
                .getSecondMessage()
                .assertError(/Failed to activate: test-cert/)
        })
    })

    describe('revoke', function () {
        this.beforeEach(function () {
            parentNode = new IotCertsFolderNode(iot, new IotNode(iot))
            node = new IotCertWithPoliciesNode(
                { id: certificateId, arn: 'arn', activeStatus: 'ACTIVE', creationDate: new globals.clock.Date() },
                parentNode,
                iot
            )
        })

        it('confirms revocation, revokes cert, and refreshes tree', async function () {
            const stub = sinon.stub()
            iot.updateCertificate = stub
            getTestWindow().onDidShowMessage(m => m.items.find(i => i.title === 'Revoke')?.select())
            await revokeCertificateCommand(node)

            getTestWindow().getFirstMessage().assertWarn('Are you sure you want to revoke certificate test-cert?')
            getTestWindow()
                .getSecondMessage()
                .assertInfo(/Revoked: test-cert/)

            assert(stub.calledOnceWithExactly({ certificateId, newStatus: 'REVOKED' }))
        })

        it('does nothing when revocation is cancelled', async function () {
            const stub = sinon.stub()
            iot.updateCertificate = stub
            getTestWindow().onDidShowMessage(m => m.selectItem('Cancel'))
            await revokeCertificateCommand(node)

            assert(stub.notCalled)
        })

        it('shows an error message if revoking the certificate fails', async function () {
            const stub = sinon.stub().rejects()
            iot.updateCertificate = stub
            getTestWindow().onDidShowMessage(m => m.items.find(i => i.title === 'Revoke')?.select())
            await revokeCertificateCommand(node)

            getTestWindow()
                .getSecondMessage()
                .assertError(/Failed to revoke: test-cert/)
        })
    })
})
