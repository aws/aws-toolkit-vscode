/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as fs from 'fs-extra'
import * as sinon from 'sinon'
import { makeTemporaryToolkitFolder, tryRemoveFolder } from '../../../shared/filesystemUtilities'
import { SshKeyPair } from '../../../awsService/ec2/sshKeyPair'
import { ChildProcess } from '../../../shared/utilities/childProcess'

describe('SshKeyUtility', async function () {
    let temporaryDirectory: string
    let keyPath: string
    let keyPair: SshKeyPair

    before(async function () {
        temporaryDirectory = await makeTemporaryToolkitFolder()
        keyPath = `${temporaryDirectory}/test-key`
        keyPair = await SshKeyPair.getSshKeyPair(keyPath)
    })

    after(async function () {
        await tryRemoveFolder(temporaryDirectory)
    })

    describe('generateSshKeys', async function () {
        it('generates key in target file', async function () {
            const contents = await fs.readFile(keyPath, 'utf-8')
            assert.notStrictEqual(contents.length, 0)
        })

        it('defaults to ed25519 key type', async function () {
            const process = new ChildProcess(`ssh-keygen`, ['-vvv', '-l', '-f', keyPath])
            const result = await process.run()
            // Check private key header for algorithm name
            assert.strictEqual(result.stdout.includes('[ED25519 256]'), true)
        })

        it('uses rsa if ed25519 not available', async function () {
            const stub = sinon.stub(SshKeyPair, 'isEd25519Supported').resolves(false)
            keyPair = await SshKeyPair.getSshKeyPair(keyPath)
            const process = new ChildProcess(`ssh-keygen`, ['-vvv', '-l', '-f', keyPath])
            const result = await process.run()
            // Check private key header for algorithm name
            assert.strictEqual(result.stdout.includes('[RSA 256]'), true)
            stub.restore()
        })
    })

    it('properly names the public key', function () {
        assert.strictEqual(keyPair.getPublicKeyPath(), `${keyPath}.pub`)
    })

    it('reads in public ssh key that is non-empty', async function () {
        const key = await keyPair.getPublicKey()
        assert.notStrictEqual(key.length, 0)
    })

    it('does not overwrite existing keys', async function () {
        const generateStub = sinon.stub(SshKeyPair, 'generateSshKeyPair')
        await SshKeyPair.getSshKeyPair(keyPath)
        sinon.assert.notCalled(generateStub)
        sinon.restore()
    })
})
