/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { createCertificateCommand } from '../../../iot/commands/createCert'
import { IotNode } from '../../../iot/explorer/iotNodes'
import { IotClient } from '../../../shared/clients/iotClient'
import { anything, mock, instance, when, deepEqual, verify } from '../../utilities/mockito'
import { IotCertsFolderNode } from '../../../iot/explorer/iotCertFolderNode'
import { Iot } from 'aws-sdk'
import { getTestWindow } from '../../shared/vscode/window'

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

        iot = mock()
        node = new IotCertsFolderNode(instance(iot), new IotNode(instance(iot)))
        saveLocation = vscode.Uri.file('/certificate')
        saveSuccess = true
    })

    afterEach(function () {
        sandbox.restore()
    })

    it('prompts for save location, creates certificate, and saves to filesystem', async function () {
        when(iot.createCertificateAndKeys(deepEqual({ setAsActive: false }))).thenResolve(certificate)

        await createCertificateCommand(node, promptFolder, saveFiles)

        getTestWindow()
            .getFirstMessage()
            .assertInfo(/Created certificate new-certificate/)

        verify(iot.deleteCertificate(anything())).never()

        sandbox.assert.calledWith(spyExecuteCommand, 'aws.refreshAwsExplorerNode', node)
    })

    it('does nothing when no save folder is selected', async function () {
        saveLocation = undefined
        await createCertificateCommand(node, promptFolder, saveFiles)

        verify(iot.createCertificateAndKeys(anything())).never()
        sandbox.assert.notCalled(spyExecuteCommand)
    })

    it('shows an error message if creating certificate fails', async function () {
        when(iot.createCertificateAndKeys(anything())).thenReject(new Error('Expected failure'))

        await createCertificateCommand(node, promptFolder, saveFiles)

        getTestWindow()
            .getFirstMessage()
            .assertError(/Failed to create certificate/)

        sandbox.assert.notCalled(spyExecuteCommand)
    })

    it('shows an error message if created certificate is invalid', async function () {
        when(iot.createCertificateAndKeys(deepEqual({ setAsActive: false }))).thenResolve({})

        await createCertificateCommand(node, promptFolder, saveFiles)

        getTestWindow()
            .getFirstMessage()
            .assertError(/Failed to create certificate/)

        sandbox.assert.notCalled(spyExecuteCommand)
    })

    it('deletes certificate if it cannot be saved', async function () {
        when(iot.createCertificateAndKeys(deepEqual({ setAsActive: false }))).thenResolve(certificate)
        saveSuccess = false

        await createCertificateCommand(node, promptFolder, saveFiles)

        getTestWindow()
            .getFirstMessage()
            .assertInfo(/Created certificate new-certificate/)

        verify(iot.deleteCertificate(deepEqual({ certificateId }))).once()
    })

    it('shows an error message if certificate cannot be deleted', async function () {
        when(iot.createCertificateAndKeys(deepEqual({ setAsActive: false }))).thenResolve(certificate)
        when(iot.deleteCertificate(anything())).thenReject(new Error('Expected failure'))
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
