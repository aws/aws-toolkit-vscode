/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { deleteCertCommand } from '../../../iot/commands/deleteCert'
import { IotCertWithPoliciesNode } from '../../../iot/explorer/iotCertificateNode'
import { IotCertsFolderNode } from '../../../iot/explorer/iotCertFolderNode'
import { IotNode } from '../../../iot/explorer/iotNodes'
import { IotClient } from '../../../shared/clients/iotClient'
import globals from '../../../shared/extensionGlobals'
import { getTestWindow } from '../../shared/vscode/window'
import assert from 'assert'

describe('deleteCertCommand', function () {
    let sandbox: sinon.SinonSandbox
    let spyExecuteCommand: sinon.SinonSpy

    const certificateId = 'test-cert'
    const status = 'INACTIVE'
    let iot: IotClient
    let node: IotCertWithPoliciesNode
    let parentNode: IotCertsFolderNode

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        spyExecuteCommand = sandbox.spy(vscode.commands, 'executeCommand')
        iot = {} as any as IotClient
        parentNode = new IotCertsFolderNode(iot, new IotNode(iot))
        node = new IotCertWithPoliciesNode(
            { id: certificateId, arn: 'arn', activeStatus: status, creationDate: new globals.clock.Date() },
            parentNode,
            iot
        )
    })

    afterEach(function () {
        sandbox.restore()
    })

    it('confirms deletion, deletes cert, and refreshes node', async function () {
        const thingsStub = sinon.stub().resolves([])
        iot.listThingsForCert = thingsStub
        const principalStub = sinon.stub().resolves({ policies: [] })
        iot.listPrincipalPolicies = principalStub
        const deleteStub = sinon.stub()
        iot.deleteCertificate = deleteStub

        getTestWindow().onDidShowMessage(m => m.items.find(i => i.title === 'Delete')?.select())
        await deleteCertCommand(node)

        getTestWindow().getFirstMessage().assertWarn('Are you sure you want to delete Certificate test-cert?')

        assert(deleteStub.calledOnceWithExactly({ certificateId, forceDelete: false }))
        assert(thingsStub.calledOnceWithExactly({ principal: 'arn' }))
        assert(principalStub.calledOnceWithExactly({ principal: 'arn' }))

        sandbox.assert.calledWith(spyExecuteCommand, 'aws.refreshAwsExplorerNode', parentNode)
    })

    it('does nothing if things are attached', async function () {
        const thingsStub = sinon.stub().resolves(['iot-thing'])
        iot.listThingsForCert = thingsStub

        getTestWindow().onDidShowMessage(m => m.items.find(i => i.title === 'Delete')?.select())
        await deleteCertCommand(node)

        getTestWindow()
            .getFirstMessage()
            .assertError(/Certificate has attached resources: iot-thing/)

        assert(thingsStub.calledOnceWithExactly({ principal: 'arn' }))
        sandbox.assert.notCalled(spyExecuteCommand)
    })

    it('does nothing when deletion is cancelled', async function () {
        const thingsStub = sinon.stub().resolves([])
        iot.listThingsForCert = thingsStub
        const deleteStub = sinon.stub()
        iot.deleteCertificate = deleteStub
        getTestWindow().onDidShowMessage(m => m.selectItem('Cancel'))
        await deleteCertCommand(node)

        assert(thingsStub.calledOnceWithExactly({ principal: 'arn' }))
        assert(deleteStub.notCalled)
    })

    it('does nothing if certificate is active', async function () {
        const thingsStub = sinon.stub().resolves([])
        iot.listThingsForCert = thingsStub
        const deleteStub = sinon.stub()
        iot.deleteCertificate = deleteStub
        node = new IotCertWithPoliciesNode(
            { id: certificateId, arn: 'arn', activeStatus: 'ACTIVE', creationDate: new globals.clock.Date() },
            parentNode,
            iot
        )
        getTestWindow().onDidShowMessage(m => m.selectItem('Delete'))
        await deleteCertCommand(node)

        assert(deleteStub.notCalled)
    })

    it('shows an error message and refreshes node when certificate deletion fails', async function () {
        const thingsStub = sinon.stub().resolves([])
        iot.listThingsForCert = thingsStub
        const principalStub = sinon.stub().resolves({ policies: [] })
        iot.listPrincipalPolicies = principalStub
        const deleteStub = sinon.stub().rejects()
        iot.deleteCertificate = deleteStub

        getTestWindow().onDidShowMessage(m => m.items.find(i => i.title === 'Delete')?.select())
        await deleteCertCommand(node)

        getTestWindow()
            .getSecondMessage()
            .assertError(/Failed to delete certificate: test-cert/)

        sandbox.assert.calledWith(spyExecuteCommand, 'aws.refreshAwsExplorerNode', parentNode)
    })

    it('shows an error message if Things are not fetched', async function () {
        const thingsStub = sinon.stub().rejects()
        iot.listThingsForCert = thingsStub
        const deleteStub = sinon.stub().rejects()
        iot.deleteCertificate = deleteStub

        await deleteCertCommand(node)

        assert(deleteStub.notCalled)

        getTestWindow()
            .getFirstMessage()
            .assertError(/Failed to retrieve Things attached to certificate/)

        sandbox.assert.notCalled(spyExecuteCommand)
    })

    it('confirms force deletion if policies are attached', async function () {
        const thingsStub = sinon.stub().resolves([])
        iot.listThingsForCert = thingsStub
        const principalStub = sinon.stub().resolves({ policies: [{ policyName: 'policy' }] })
        iot.listPrincipalPolicies = principalStub
        const deleteStub = sinon.stub()
        iot.deleteCertificate = deleteStub

        getTestWindow().onDidShowMessage(m => m.items.find(i => i.title === 'Delete')?.select())
        await deleteCertCommand(node)

        getTestWindow().getSecondMessage().assertWarn('Certificate has attached policies. Delete anyway?')

        assert(deleteStub.calledOnceWithExactly({ certificateId, forceDelete: true }))

        sandbox.assert.calledWith(spyExecuteCommand, 'aws.refreshAwsExplorerNode', parentNode)
    })

    it('shows an error message but refreshes node if policies are not fetched', async function () {
        const thingsStub = sinon.stub().resolves([])
        iot.listThingsForCert = thingsStub
        const principalStub = sinon.stub().rejects()
        iot.listPrincipalPolicies = principalStub
        const deleteStub = sinon.stub()
        iot.deleteCertificate = deleteStub

        getTestWindow().onDidShowMessage(m => m.items.find(i => i.title === 'Delete')?.select())
        await deleteCertCommand(node)

        getTestWindow().getSecondMessage().assertError('Failed to retrieve policies attached to certificate')
        assert(deleteStub.calledOnceWithExactly({ certificateId, forceDelete: false }))

        sandbox.assert.calledWith(spyExecuteCommand, 'aws.refreshAwsExplorerNode', parentNode)
    })
})
