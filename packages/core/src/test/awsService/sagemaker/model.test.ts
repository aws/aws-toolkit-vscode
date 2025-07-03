/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as sinon from 'sinon'
import * as os from 'os'
import * as path from 'path'
import { DevSettings, fs, ToolkitError } from '../../../shared'
import { removeKnownHost, startLocalServer, stopLocalServer } from '../../../awsService/sagemaker/model'
import { assertLogsContain } from '../../globalSetup.test'
import assert from 'assert'

describe('SageMaker Model', () => {
    describe('startLocalServer', function () {
        const ctx = {
            globalStorageUri: vscode.Uri.file(path.join(os.tmpdir(), 'test-storage')),
            extensionPath: path.join(os.tmpdir(), 'extension'),
            asAbsolutePath: (relPath: string) => path.join(path.join(os.tmpdir(), 'extension'), relPath),
        } as vscode.ExtensionContext

        let sandbox: sinon.SinonSandbox

        beforeEach(() => {
            sandbox = sinon.createSandbox()
        })

        afterEach(() => {
            sandbox.restore()
        })

        it('waits for info file and starts server', async function () {
            // Simulate the file doesn't exist initially, then appears on 3rd check
            const existsStub = sandbox.stub(fs, 'existsFile')
            existsStub.onCall(0).resolves(false)
            existsStub.onCall(1).resolves(false)
            existsStub.onCall(2).resolves(true)

            sandbox.stub(require('fs'), 'openSync').returns(42)

            const stopStub = sandbox.stub().resolves()
            sandbox.replace(require('../../../awsService/sagemaker/model'), 'stopLocalServer', stopStub)

            const spawnStub = sandbox.stub().returns({ unref: sandbox.stub() })
            sandbox.replace(require('../../../awsService/sagemaker/utils'), 'spawnDetachedServer', spawnStub)

            sandbox.stub(DevSettings.instance, 'get').returns({ sagemaker: 'https://fake-endpoint' })

            await startLocalServer(ctx)

            sinon.assert.called(spawnStub)
            sinon.assert.calledWith(
                spawnStub,
                process.execPath,
                [ctx.asAbsolutePath('dist/src/awsService/sagemaker/detached-server/server.js')],
                sinon.match.any
            )

            assert.ok(existsStub.callCount >= 3, 'should have retried for file existence')
        })
    })

    describe('stopLocalServer', function () {
        const ctx = {
            globalStorageUri: vscode.Uri.file(path.join(os.tmpdir(), 'test-storage')),
        } as vscode.ExtensionContext

        const infoFilePath = path.join(ctx.globalStorageUri.fsPath, 'sagemaker-local-server-info.json')
        const validPid = 12345
        const validJson = JSON.stringify({ pid: validPid })
        let sandbox: sinon.SinonSandbox

        beforeEach(() => {
            sandbox = sinon.createSandbox()
        })

        afterEach(() => {
            sandbox.restore()
        })

        it('logs debug when successfully stops server and deletes file', async function () {
            sandbox.stub(fs, 'existsFile').resolves(true)
            sandbox.stub(fs, 'readFileText').resolves(validJson)
            const killStub = sandbox.stub(process, 'kill').returns(true)
            const deleteStub = sandbox.stub(fs, 'delete').resolves()

            await stopLocalServer(ctx)

            sinon.assert.calledWith(killStub, validPid)
            sinon.assert.calledWith(deleteStub, infoFilePath)
            assertLogsContain(`stopped local server with PID ${validPid}`, false, 'debug')
            assertLogsContain('removed server info file.', false, 'debug')
        })

        it('throws ToolkitError when info file is invalid JSON', async function () {
            sandbox.stub(fs, 'existsFile').resolves(true)
            sandbox.stub(fs, 'readFileText').resolves('invalid json')

            try {
                await stopLocalServer(ctx)
                assert.ok(false, 'Expected error not thrown')
            } catch (err) {
                assert.ok(err instanceof ToolkitError)
                assert.strictEqual(err.message, 'failed to parse server info file')
            }
        })

        it('throws ToolkitError when killing process fails for another reason', async function () {
            sandbox.stub(fs, 'existsFile').resolves(true)
            sandbox.stub(fs, 'readFileText').resolves(validJson)
            sandbox.stub(fs, 'delete').resolves()
            sandbox.stub(process, 'kill').throws({ code: 'EPERM', message: 'permission denied' })

            try {
                await stopLocalServer(ctx)
                assert.ok(false)
            } catch (err) {
                assert.ok(err instanceof ToolkitError)
                assert.strictEqual(err.message, 'failed to stop local server')
            }
        })
    })

    describe('removeKnownHost', function () {
        const knownHostsPath = path.join(os.homedir(), '.ssh', 'known_hosts')
        const hostname = 'test.host.com'
        let sandbox: sinon.SinonSandbox

        beforeEach(function () {
            sandbox = sinon.createSandbox()
        })

        afterEach(function () {
            sandbox.restore()
        })

        it('removes line with hostname and writes updated file', async function () {
            sandbox.stub(fs, 'existsFile').resolves(true)

            const inputContent = `${hostname} ssh-rsa AAAA\nsome.other.com ssh-rsa BBBB`
            const expectedOutput = `some.other.com ssh-rsa BBBB`

            sandbox.stub(fs, 'readFileText').resolves(inputContent)

            const writeStub = sandbox.stub(fs, 'writeFile').resolves()
            await removeKnownHost(hostname)

            sinon.assert.calledWith(
                writeStub,
                knownHostsPath,
                sinon.match((value: string) => value.trim() === expectedOutput),
                { atomic: true }
            )
        })

        it('logs warning when known_hosts does not exist', async function () {
            sandbox.stub(fs, 'existsFile').resolves(false)

            await removeKnownHost('test.host.com')

            assertLogsContain(`known_hosts not found at`, false, 'warn')
        })

        it('throws ToolkitError when reading known_hosts fails', async function () {
            sandbox.stub(fs, 'existsFile').resolves(true)
            sandbox.stub(fs, 'readFileText').rejects(new Error('read failed'))

            try {
                await removeKnownHost(hostname)
                assert.ok(false, 'Expected error was not thrown')
            } catch (err) {
                assert.ok(err instanceof ToolkitError)
                assert.strictEqual(err.message, 'Failed to read known_hosts file')
                assert.strictEqual((err as ToolkitError).cause?.message, 'read failed')
            }
        })

        it('throws ToolkitError when writing known_hosts fails', async function () {
            sandbox.stub(fs, 'existsFile').resolves(true)
            sandbox.stub(fs, 'readFileText').resolves(`${hostname} ssh-rsa key\nsomehost ssh-rsa key`)
            sandbox.stub(fs, 'writeFile').rejects(new Error('write failed'))

            try {
                await removeKnownHost(hostname)
                assert.ok(false, 'Expected error was not thrown')
            } catch (err) {
                assert.ok(err instanceof ToolkitError)
                assert.strictEqual(err.message, 'Failed to write updated known_hosts file')
                assert.strictEqual((err as ToolkitError).cause?.message, 'write failed')
            }
        })
    })
})
