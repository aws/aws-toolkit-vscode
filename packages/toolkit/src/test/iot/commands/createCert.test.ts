/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { createCertificateCommand } from '../../../iot/commands/createCert'
import { IotNode } from '../../../iot/explorer/iotNodes'
import { IotClient } from '../../../shared/clients/iotClient'
import { IotCertsFolderNode } from '../../../iot/explorer/iotCertFolderNode'
import { Iot } from 'aws-sdk'
import { getTestWindow } from '../../shared/vscode/window'
import assert from 'assert'

describe('createCertificateCommand', function () {
    let sandbox: sinon.SinonSandbox
    let spyExecuteCommand: sinon.SinonSpy

    const certificateId = 'new-certificate'
    const certificateArn = 'arn'
    const certificatePem = 'certPem'
    const keyPair = { PrivateKey: 'private', PublicKey: 'public' }
    const certificate: Iot.CreateKeysAndCertificateResponse = { certificateId, certificateArn, certificatePem, keyPair }
    let iot: IotClient
    let node: IotCertsFolderNode
    let saveLocation: vscode.Uri | undefined = vscode.Uri.file('/certificate.txt')
    let saveSuccess: boolean
    const promptFolder: () => Promise<vscode.Uri | undefined> = async () => {
        return saveLocation
    }
    const saveFiles: (
        basePath: vscode.Uri,
        certId: string,
        certPem: string,
        privateKey: string,
        publicKey: string
    ) => Promise<boolean> = async (basePath, certId, certPem, privateKey, publicKey) => {
        return saveSuccess
    }

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        spyExecuteCommand = sandbox.spy(vscode.commands, 'executeCommand')

        iot = {} as any as IotClient
        node = new IotCertsFolderNode(iot, new IotNode(iot))
        saveLocation = vscode.Uri.file('/certificate')
        saveSuccess = true
    })

    afterEach(function () {
        sandbox.restore()
    })

    it('prompts for save location, creates certificate, and saves to filesystem', async function () {
        const createStub = sinon.stub().resolves(certificate)
        iot.createCertificateAndKeys = createStub
        const deleteStub = sinon.stub()
        iot.deleteCertificate = deleteStub

        await createCertificateCommand(node, promptFolder, saveFiles)

        getTestWindow()
            .getFirstMessage()
            .assertInfo(/Created certificate new-certificate/)

        assert(createStub.calledOnceWithExactly({ setAsActive: false }))
        assert(deleteStub.notCalled)

        sandbox.assert.calledWith(spyExecuteCommand, 'aws.refreshAwsExplorerNode', node)
    })

    it('does nothing when no save folder is selected', async function () {
        saveLocation = undefined
        const createStub = sinon.stub().resolves(certificate)
        iot.createCertificateAndKeys = createStub
        await createCertificateCommand(node, promptFolder, saveFiles)

        assert(createStub.notCalled)
        sandbox.assert.notCalled(spyExecuteCommand)
    })

    it('shows an error message if creating certificate fails', async function () {
        const createStub = sinon.stub().rejects()
        iot.createCertificateAndKeys = createStub

        await createCertificateCommand(node, promptFolder, saveFiles)

        getTestWindow()
            .getFirstMessage()
            .assertError(/Failed to create certificate/)

        sandbox.assert.notCalled(spyExecuteCommand)
    })

    it('shows an error message if created certificate is invalid', async function () {
        const createStub = sinon.stub().resolves({})
        iot.createCertificateAndKeys = createStub

        await createCertificateCommand(node, promptFolder, saveFiles)

        getTestWindow()
            .getFirstMessage()
            .assertError(/Failed to create certificate/)

        assert(createStub.calledOnceWithExactly({ setAsActive: false }))
        sandbox.assert.notCalled(spyExecuteCommand)
    })

    it('deletes certificate if it cannot be saved', async function () {
        const createStub = sinon.stub().resolves(certificate)
        iot.createCertificateAndKeys = createStub
        const deleteStub = sinon.stub()
        iot.deleteCertificate = deleteStub
        saveSuccess = false

        await createCertificateCommand(node, promptFolder, saveFiles)

        getTestWindow()
            .getFirstMessage()
            .assertInfo(/Created certificate new-certificate/)

        assert(createStub.calledOnceWithExactly({ setAsActive: false }))
        assert(deleteStub.calledOnceWithExactly({ certificateId }))
    })

    it('shows an error message if certificate cannot be deleted', async function () {
        const createStub = sinon.stub().resolves(certificate)
        iot.createCertificateAndKeys = createStub
        const deleteStub = sinon.stub().rejects()
        iot.deleteCertificate = deleteStub
        saveSuccess = false

        await createCertificateCommand(node, promptFolder, saveFiles)

        getTestWindow()
            .getFirstMessage()
            .assertInfo(/Created certificate new-certificate/)
        getTestWindow()
            .getSecondMessage()
            .assertError(/Failed to delete Certificate new-certificate/)
    })
})
