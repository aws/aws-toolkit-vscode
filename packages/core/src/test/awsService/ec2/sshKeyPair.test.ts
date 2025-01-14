/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'assert'
import nodefs from 'fs' // eslint-disable-line no-restricted-imports
import * as sinon from 'sinon'
import * as os from 'os'
import { SshKeyPair } from '../../../awsService/ec2/sshKeyPair'
import { installFakeClock } from '../../testUtil'
import { InstalledClock } from '@sinonjs/fake-timers'
import { ChildProcess } from '../../../shared/utilities/processUtils'
import { fs, globals } from '../../../shared'

describe('SshKeyPair', async function () {
    let clock: InstalledClock
    let keyPair: SshKeyPair
    let keyName: string

    before(async function () {
        clock = installFakeClock()
    })

    beforeEach(async function () {
        keyName = 'testKeyPair'
        keyPair = await SshKeyPair.getSshKeyPair(keyName, 30000)
    })

    afterEach(async function () {
        await keyPair.delete()
    })

    after(async function () {
        clock.uninstall()
        sinon.restore()
    })

    it('generates key in target file', async function () {
        const contents = await fs.readFileBytes(keyPair.getPrivateKeyPath())
        assert.notStrictEqual(contents.length, 0)
    })

    it('generates unique key each time', async function () {
        const keyPair2 = await SshKeyPair.getSshKeyPair(`${keyName}2`, 30000)
        const content1 = await fs.readFileBytes(keyPair2.getPrivateKeyPath())
        const content2 = await fs.readFileBytes(keyPair.getPrivateKeyPath())
        assert.notStrictEqual(content1, content2)
        await keyPair2.delete()
    })

    it('sets permission of the file to read/write owner', async function () {
        if (!globals.isWeb && os.platform() !== 'win32') {
            const result = nodefs.statSync(keyPair.getPrivateKeyPath())
            assert.strictEqual(result.mode & 0o777, 0o600)
        }
    })

    it('defaults to ed25519 key type', async function () {
        const process = new ChildProcess(`ssh-keygen`, ['-vvv', '-l', '-f', keyPair.getPrivateKeyPath()])
        const result = await process.run()
        // Check private key header for algorithm name
        assert.strictEqual(result.stdout.includes('[ED25519 256]'), true)
    })

    it('falls back on rsa if ed25519 not available', async function () {
        await keyPair.delete()
        const stub = sinon.stub(SshKeyPair, 'tryKeyGen')
        stub.onFirstCall().resolves(false)
        stub.callThrough()
        const rsaKey = await SshKeyPair.getSshKeyPair('rsa', 30000)
        const process = new ChildProcess(`ssh-keygen`, ['-vvv', '-l', '-f', rsaKey.getPrivateKeyPath()])
        const result = await process.run()
        // Check private key header for algorithm name
        assert.strictEqual(result.stdout.includes('[RSA'), true)
        stub.restore()
    })

    it('reads in public ssh key that is non-empty', async function () {
        const key = await keyPair.getPublicKey()
        assert.notStrictEqual(key.length, 0)
    })

    it('does overwrite existing keys on get call', async function () {
        const generateStub = sinon.spy(SshKeyPair, 'generateSshKeyPair')
        const keyBefore = await fs.readFileBytes(keyPair.getPrivateKeyPath())
        keyPair = await SshKeyPair.getSshKeyPair(keyName, 30000)

        const keyAfter = await fs.readFileBytes(keyPair.getPrivateKeyPath())
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

        keyPair = await SshKeyPair.getSshKeyPair(keyName, 50)
        await clock.tickAsync(10)
        sinon.assert.notCalled(deleteStub)
        await clock.tickAsync(100)
        sinon.assert.calledOnce(deleteStub)
        sinon.restore()
    })

    it('determines deleted status based on file system', async function () {
        await fs.delete(keyPair.getPrivateKeyPath())
        await fs.delete(keyPair.getPublicKeyPath())

        assert(keyPair.isDeleted())
    })

    describe('isDeleted', async function () {
        it('returns false if key files exist', async function () {
            assert.strictEqual(await keyPair.isDeleted(), false)
        })

        it('returns true if key files do not exist', async function () {
            await keyPair.delete()
            assert.strictEqual(await keyPair.isDeleted(), true)
        })

        it('returns true if private key remains', async function () {
            await fs.delete(keyPair.getPublicKeyPath())
            assert.strictEqual(await keyPair.isDeleted(), true)
        })

        it('returns true if public key remains', async function () {
            await fs.delete(keyPair.getPrivateKeyPath())
            assert.strictEqual(await keyPair.isDeleted(), true)
        })
    })
})
