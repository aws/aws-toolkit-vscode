/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import { createCertificateCommand } from '../../../iot/commands/createCert'
import { IotNode } from '../../../iot/explorer/iotNodes'
import { IotClient } from '../../../shared/clients/iotClient'
import { FakeWindow } from '../../shared/vscode/fakeWindow'
import { anything, mock, instance, when, deepEqual, verify } from '../../utilities/mockito'
import { FakeCommands } from '../../shared/vscode/fakeCommands'
import { Window } from '../../../shared/vscode/window'
import { IotCertsFolderNode } from '../../../iot/explorer/iotCertFolderNode'
import { Iot } from 'aws-sdk'

describe('createCertificateCommand', function () {
    const certificateId = 'new-certificate'
    const certificateArn = 'arn'
    const certificatePem = 'certPem'
    const keyPair = { PrivateKey: 'private', PublicKey: 'public' }
    const certificate: Iot.CreateKeysAndCertificateResponse = { certificateId, certificateArn, certificatePem, keyPair }
    let iot: IotClient
    let node: IotCertsFolderNode
    let saveLocation: vscode.Uri | undefined = vscode.Uri.file('/certificate.txt')
    let saveSuccess: boolean
    const promptFolder: (window: Window) => Promise<vscode.Uri | undefined> = async window => {
        return saveLocation
    }
    const saveFiles: (
        window: Window,
        basePath: vscode.Uri,
        certId: string,
        certPem: string,
        privateKey: string,
        publicKey: string
    ) => Promise<boolean> = async (window, basePath, certId, certPem, privateKey, publicKey) => {
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

        const window = new FakeWindow({ message: { warningSelection: 'Confirm' } })
        const commands = new FakeCommands()
        await createCertificateCommand(node, promptFolder, saveFiles, window, commands)

        assert.strictEqual(window.message.warning, 'Create a new X.509 certificate and RSA key pair?')

        assert.strictEqual(window.message.information, 'Created certificate new-certificate')

        verify(iot.deleteCertificate(anything())).never()

        assert.strictEqual(commands.command, 'aws.refreshAwsExplorerNode')
        assert.deepStrictEqual(commands.args, [node])
    })

    it('does nothing when creation is canceled', async function () {
        const window = new FakeWindow({ message: { warningSelection: 'Cancel' } })
        const commands = new FakeCommands()
        await createCertificateCommand(node, promptFolder, saveFiles, window, commands)

        verify(iot.createCertificateAndKeys(anything())).never()
        assert.strictEqual(commands.command, undefined)
    })

    it('does nothing when no save folder is selected', async function () {
        saveLocation = undefined
        const window = new FakeWindow({ message: { warningSelection: 'Confirm' } })
        const commands = new FakeCommands()
        await createCertificateCommand(node, promptFolder, saveFiles, window, commands)

        verify(iot.createCertificateAndKeys(anything())).never()
        assert.strictEqual(commands.command, undefined)
    })

    it('shows an error message if creating certificate fails', async function () {
        when(iot.createCertificateAndKeys(anything())).thenReject(new Error('Expected failure'))

        const window = new FakeWindow({ message: { warningSelection: 'Confirm' } })
        const commands = new FakeCommands()
        await createCertificateCommand(node, promptFolder, saveFiles, window, commands)

        assert.ok(window.message.error?.includes('Failed to create certificate'))

        assert.strictEqual(commands.command, undefined)
    })

    it('shows an error message if created certificate is invalid', async function () {
        when(iot.createCertificateAndKeys(deepEqual({ setAsActive: false }))).thenResolve({})

        const window = new FakeWindow({ message: { warningSelection: 'Confirm' } })
        const commands = new FakeCommands()
        await createCertificateCommand(node, promptFolder, saveFiles, window, commands)

        assert.ok(window.message.error?.includes('Failed to create certificate'))

        assert.strictEqual(commands.command, undefined)
    })

    it('deletes certificate if it cannot be saved', async function () {
        when(iot.createCertificateAndKeys(deepEqual({ setAsActive: false }))).thenResolve(certificate)
        saveSuccess = false

        const window = new FakeWindow({ message: { warningSelection: 'Confirm' } })
        const commands = new FakeCommands()
        await createCertificateCommand(node, promptFolder, saveFiles, window, commands)

        assert.strictEqual(window.message.information, 'Created certificate new-certificate')

        verify(iot.deleteCertificate(deepEqual({ certificateId }))).once()
    })

    it('shows an error message if certificate cannot be deleted', async function () {
        when(iot.createCertificateAndKeys(deepEqual({ setAsActive: false }))).thenResolve(certificate)
        when(iot.deleteCertificate(anything())).thenReject(new Error('Expected failure'))
        saveSuccess = false

        const window = new FakeWindow({ message: { warningSelection: 'Confirm' } })
        const commands = new FakeCommands()
        await createCertificateCommand(node, promptFolder, saveFiles, window, commands)

        assert.strictEqual(window.message.information, 'Created certificate new-certificate')
        assert.ok(window.message.error?.includes('Failed to delete Certificate new-certificate'))
    })
})
