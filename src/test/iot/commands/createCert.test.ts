/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as vscode from 'vscode'
import { createCertificateCommand } from '../../../iot/commands/createCert'
import { IotNode } from '../../../iot/explorer/iotNodes'
import { IotClient } from '../../../shared/clients/iotClient'
import { anything, mock, instance, when, deepEqual, verify } from '../../utilities/mockito'
import { FakeCommands } from '../../shared/vscode/fakeCommands'
import { IotCertsFolderNode } from '../../../iot/explorer/iotCertFolderNode'
import { CreateKeysAndCertificateCommandOutput } from "@aws-sdk/client-iot";
import { getTestWindow } from '../../shared/vscode/window'

describe('createCertificateCommand', function () {
    const certificateId = 'new-certificate'
    const certificateArn = 'arn'
    const certificatePem = 'certPem'
    const keyPair = { PrivateKey: 'private', PublicKey: 'public' }
    const certificate: CreateKeysAndCertificateCommandOutput = { certificateId, certificateArn, certificatePem, keyPair }
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
        iot = mock()
        node = new IotCertsFolderNode(instance(iot), new IotNode(instance(iot)))
        saveLocation = vscode.Uri.file('/certificate')
        saveSuccess = true
    })

    it('prompts for save location, creates certificate, and saves to filesystem', async function () {
        when(iot.createCertificateAndKeys(deepEqual({ setAsActive: false }))).thenResolve(certificate)

        const commands = new FakeCommands()
        await createCertificateCommand(node, promptFolder, saveFiles, commands)

        getTestWindow()
            .getFirstMessage()
            .assertInfo(/Created certificate new-certificate/)

        verify(iot.deleteCertificate(anything())).never()

        assert.strictEqual(commands.command, 'aws.refreshAwsExplorerNode')
        assert.deepStrictEqual(commands.args, [node])
    })

    it('does nothing when no save folder is selected', async function () {
        saveLocation = undefined
        const commands = new FakeCommands()
        await createCertificateCommand(node, promptFolder, saveFiles, commands)

        verify(iot.createCertificateAndKeys(anything())).never()
        assert.strictEqual(commands.command, undefined)
    })

    it('shows an error message if creating certificate fails', async function () {
        when(iot.createCertificateAndKeys(anything())).thenReject(new Error('Expected failure'))

        const commands = new FakeCommands()
        await createCertificateCommand(node, promptFolder, saveFiles, commands)

        getTestWindow()
            .getFirstMessage()
            .assertError(/Failed to create certificate/)

        assert.strictEqual(commands.command, undefined)
    })

    it('shows an error message if created certificate is invalid', async function () {
        when(iot.createCertificateAndKeys(deepEqual({ setAsActive: false }))).thenResolve({})

        const commands = new FakeCommands()
        await createCertificateCommand(node, promptFolder, saveFiles, commands)

        getTestWindow()
            .getFirstMessage()
            .assertError(/Failed to create certificate/)

        assert.strictEqual(commands.command, undefined)
    })

    it('deletes certificate if it cannot be saved', async function () {
        when(iot.createCertificateAndKeys(deepEqual({ setAsActive: false }))).thenResolve(certificate)
        saveSuccess = false

        const commands = new FakeCommands()
        await createCertificateCommand(node, promptFolder, saveFiles, commands)

        getTestWindow()
            .getFirstMessage()
            .assertInfo(/Created certificate new-certificate/)

        verify(iot.deleteCertificate(deepEqual({ certificateId }))).once()
    })

    it('shows an error message if certificate cannot be deleted', async function () {
        when(iot.createCertificateAndKeys(deepEqual({ setAsActive: false }))).thenResolve(certificate)
        when(iot.deleteCertificate(anything())).thenReject(new Error('Expected failure'))
        saveSuccess = false

        const commands = new FakeCommands()
        await createCertificateCommand(node, promptFolder, saveFiles, commands)

        getTestWindow()
            .getFirstMessage()
            .assertInfo(/Created certificate new-certificate/)
        getTestWindow()
            .getSecondMessage()
            .assertError(/Failed to delete Certificate new-certificate/)
    })
})
