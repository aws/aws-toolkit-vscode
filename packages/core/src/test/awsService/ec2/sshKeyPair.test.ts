/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import assert from 'assert'
import * as sinon from 'sinon'
import * as path from 'path'
import { SshKeyPair } from '../../../awsService/ec2/sshKeyPair'
import { createTestWorkspaceFolder, installFakeClock } from '../../testUtil'
import { InstalledClock } from '@sinonjs/fake-timers'
import { ChildProcess } from '../../../shared/utilities/processUtils'
import { fs } from '../../../shared'

describe('SshKeyUtility', async function () {
    let temporaryDirectory: string
    let keyPath: string
    let keyPair: SshKeyPair
    let clock: InstalledClock

    before(async function () {
        temporaryDirectory = (await createTestWorkspaceFolder()).uri.fsPath
        keyPath = path.join(temporaryDirectory, 'testKeyPair')
        clock = installFakeClock()
    })

    beforeEach(async function () {
        keyPair = await SshKeyPair.getSshKeyPair(keyPath, 30000)
    })

    afterEach(async function () {
        await keyPair.delete()
    })

    after(async function () {
        await keyPair.delete()
        clock.uninstall()
        sinon.restore()
    })

    it('generates key in target file', async function () {
        const contents = await fs.readFile(vscode.Uri.file(keyPath))
        assert.notStrictEqual(contents.length, 0)
    })

    it('generates unique key each time', async function () {
        const beforeContent = await fs.readFile(vscode.Uri.file(keyPath))
        keyPair = await SshKeyPair.getSshKeyPair(keyPath, 30000)
        const afterContent = await fs.readFile(vscode.Uri.file(keyPath))
        assert.notStrictEqual(beforeContent, afterContent)
    })

    it('defaults to ed25519 key type', async function () {
        const process = new ChildProcess(`ssh-keygen`, ['-vvv', '-l', '-f', keyPath])
        const result = await process.run()
        // Check private key header for algorithm name
        assert.strictEqual(result.stdout.includes('[ED25519 256]'), true)
    })

    it('falls back on rsa if ed25519 not available', async function () {
        await keyPair.delete()
        const stub = sinon.stub(SshKeyPair, 'tryKeyGen')
        stub.onFirstCall().resolves(false)
        stub.callThrough()
        keyPair = await SshKeyPair.getSshKeyPair(keyPath, 30000)
        const process = new ChildProcess(`ssh-keygen`, ['-vvv', '-l', '-f', keyPath])
        const result = await process.run()
        // Check private key header for algorithm name
        assert.strictEqual(result.stdout.includes('[RSA'), true)
        stub.restore()
    })

    it('properly names the public key', function () {
        assert.strictEqual(keyPair.getPublicKeyPath(), `${keyPath}.pub`)
    })

    it('reads in public ssh key that is non-empty', async function () {
        const key = await keyPair.getPublicKey()
        assert.notStrictEqual(key.length, 0)
    })

    it('does overwrite existing keys on get call', async function () {
        const generateStub = sinon.spy(SshKeyPair, 'generateSshKeyPair')
        const keyBefore = await fs.readFile(vscode.Uri.file(keyPath))
        keyPair = await SshKeyPair.getSshKeyPair(keyPath, 30000)

        const keyAfter = await fs.readFile(vscode.Uri.file(keyPath))
        sinon.assert.calledOnce(generateStub)

        assert.notStrictEqual(keyBefore, keyAfter)
        sinon.restore()
    })

    it('deletes key on delete', async function () {
        const pubKeyExistsBefore = await fs.existsFile(keyPair.getPublicKeyPath())
        const privateKeyExistsBefore = await fs.existsFile(keyPair.getPrivateKeyPath())

        await keyPair.delete()

        const pubKeyExistsAfter = await fs.existsFile(keyPair.getPublicKeyPath())
        const privateKeyExistsAfter = await fs.existsFile(keyPair.getPrivateKeyPath())

        assert.strictEqual(pubKeyExistsBefore && privateKeyExistsBefore, true)
        assert.strictEqual(pubKeyExistsAfter && privateKeyExistsAfter, false)
        assert(keyPair.isDeleted())
    })

    it('deletes keys after timeout', async function () {
        // Stub methods interacting with file system to avoid flaky test.
        sinon.stub(SshKeyPair, 'generateSshKeyPair')
        const deleteStub = sinon.stub(SshKeyPair.prototype, 'delete')

        keyPair = await SshKeyPair.getSshKeyPair(keyPath, 50)
        await clock.tickAsync(10)
        sinon.assert.notCalled(deleteStub)
        await clock.tickAsync(100)
        sinon.assert.calledOnce(deleteStub)
        sinon.restore()
    })
})
