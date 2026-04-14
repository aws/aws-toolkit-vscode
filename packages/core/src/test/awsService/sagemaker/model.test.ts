/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as sinon from 'sinon'
import * as os from 'os'
import * as path from 'path'
import { DevSettings, fs, ToolkitError } from '../../../shared'
import {
    startLocalServer,
    stopLocalServer,
    startRemoteViaSageMakerSshKiro,
    getSshPrefix,
    isValidSshHostname,
    createValidSshSession,
    extractRegionFromStreamUrl,
} from '../../../awsService/sagemaker/model'
import { removeKnownHost } from '../../../awsService/sagemaker/utils'
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

        it('throws ToolkitError when info file never appears', async function () {
            sandbox.stub(fs, 'existsFile').resolves(false)
            sandbox.stub(require('fs'), 'openSync').returns(42)
            sandbox.replace(
                require('../../../awsService/sagemaker/model'),
                'stopLocalServer',
                sandbox.stub().resolves()
            )
            sandbox.replace(
                require('../../../awsService/sagemaker/utils'),
                'spawnDetachedServer',
                sandbox.stub().returns({ unref: sandbox.stub() })
            )
            sandbox.stub(DevSettings.instance, 'get').returns({})

            try {
                await startLocalServer(ctx)
                assert.ok(false, 'Expected error not thrown')
            } catch (err) {
                assert.ok(err instanceof ToolkitError)
                assert.ok(err.message.includes('Timed out waiting for local server info file'))
            }
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

        it('logs warning when process not found (ESRCH)', async function () {
            sandbox.stub(fs, 'existsFile').resolves(true)
            sandbox.stub(fs, 'readFileText').resolves(validJson)
            sandbox.stub(fs, 'delete').resolves()
            sandbox.stub(process, 'kill').throws({ code: 'ESRCH', message: 'no such process' })

            await stopLocalServer(ctx)

            assertLogsContain(`no process found with PID ${validPid}. It may have already exited.`, false, 'warn')
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

        it('logs warning when PID is invalid', async function () {
            sandbox.stub(fs, 'existsFile').resolves(true)
            sandbox.stub(fs, 'readFileText').resolves(JSON.stringify({ pid: 'invalid' }))
            sandbox.stub(fs, 'delete').resolves()

            await stopLocalServer(ctx)

            assertLogsContain('no valid PID found in info file.', false, 'warn')
        })

        it('logs warning when file deletion fails', async function () {
            sandbox.stub(fs, 'existsFile').resolves(true)
            sandbox.stub(fs, 'readFileText').resolves(validJson)
            sandbox.stub(process, 'kill').returns(true)
            sandbox.stub(fs, 'delete').rejects(new Error('delete failed'))

            await stopLocalServer(ctx)

            assertLogsContain('could not delete info file: delete failed', false, 'warn')
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
            assertLogsContain(`Removed '${hostname}' from known_hosts`, false, 'debug')
        })

        it('removes case-sensitive hostname when entry in known_hosts is lowercase', async function () {
            const mixedCaseHostname = 'Test.Host.Com'

            sandbox.stub(fs, 'existsFile').resolves(true)

            const inputContent = `test.host.com ssh-rsa AAAA\nsome.other.com ssh-rsa BBBB`
            const expectedOutput = `some.other.com ssh-rsa BBBB`

            sandbox.stub(fs, 'readFileText').resolves(inputContent)
            const writeStub = sandbox.stub(fs, 'writeFile').resolves()

            await removeKnownHost(mixedCaseHostname)

            sinon.assert.calledWith(
                writeStub,
                path.join(os.homedir(), '.ssh', 'known_hosts'),
                sinon.match((value: string) => value.trim() === expectedOutput),
                { atomic: true }
            )
            assertLogsContain(`Removed '${mixedCaseHostname}' from known_hosts`, false, 'debug')
        })

        it('handles hostname in comma-separated list', async function () {
            sandbox.stub(fs, 'existsFile').resolves(true)

            const inputContent = `host1,${hostname},host2 ssh-rsa AAAA\nother.host ssh-rsa BBBB`
            const expectedOutput = `other.host ssh-rsa BBBB`

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

        it('does not write file when hostname not found', async function () {
            sandbox.stub(fs, 'existsFile').resolves(true)

            const inputContent = `other.host ssh-rsa AAAA\nsome.other.com ssh-rsa BBBB`
            sandbox.stub(fs, 'readFileText').resolves(inputContent)
            const writeStub = sandbox.stub(fs, 'writeFile').resolves()

            await removeKnownHost(hostname)

            sinon.assert.notCalled(writeStub)
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

    describe('startRemoteViaSageMakerSshKiro', function () {
        let sandbox: sinon.SinonSandbox
        let mockProcessClass: sinon.SinonStub
        let mockProcessInstance: { run: sinon.SinonStub }

        beforeEach(function () {
            sandbox = sinon.createSandbox()
            mockProcessInstance = { run: sandbox.stub().resolves() }
            mockProcessClass = sandbox.stub().returns(mockProcessInstance)
        })

        afterEach(function () {
            sandbox.restore()
        })

        it('constructs correct workspace URI without user', async function () {
            await startRemoteViaSageMakerSshKiro(
                mockProcessClass as any,
                'space_arn',
                '/home/sagemaker-user',
                '/usr/bin/code'
            )

            const expectedUri = `vscode-remote://sagemaker-ssh-kiro+space_arn/home/sagemaker-user`
            sinon.assert.calledOnceWithExactly(mockProcessClass, '/usr/bin/code', ['--folder-uri', expectedUri])
            sinon.assert.calledOnce(mockProcessInstance.run)
        })

        it('constructs correct workspace URI with user', async function () {
            await startRemoteViaSageMakerSshKiro(
                mockProcessClass as any,
                'space_arn',
                '/home/sagemaker-user',
                '/usr/bin/code',
                'sagemaker-user'
            )

            const expectedUri = `vscode-remote://sagemaker-ssh-kiro+sagemaker-user@space_arn/home/sagemaker-user`
            sinon.assert.calledOnceWithExactly(mockProcessClass, '/usr/bin/code', ['--folder-uri', expectedUri])
            sinon.assert.calledOnce(mockProcessInstance.run)
        })

        it('handles different target directories', async function () {
            await startRemoteViaSageMakerSshKiro(
                mockProcessClass as any,
                'space_arn',
                '/workspace/project',
                '/usr/bin/code',
                'sagemaker-user'
            )

            const expectedUri = `vscode-remote://sagemaker-ssh-kiro+sagemaker-user@space_arn/workspace/project`
            sinon.assert.calledOnceWithExactly(mockProcessClass, '/usr/bin/code', ['--folder-uri', expectedUri])
            sinon.assert.calledOnce(mockProcessInstance.run)
        })
    })
})

describe('getSshPrefix', function () {
    let sandbox: sinon.SinonSandbox

    beforeEach(function () {
        sandbox = sinon.createSandbox()
    })

    afterEach(function () {
        sandbox.restore()
    })

    it('returns sm_ for vscode sagemaker connection', function () {
        sandbox.stub(vscode.env, 'appName').value('Visual Studio Code')
        assert.strictEqual(getSshPrefix('sm_lc'), 'sm_')
        assert.strictEqual(getSshPrefix('sm_dl'), 'sm_')
    })

    it('returns smc_ for cursor sagemaker connection', function () {
        sandbox.stub(vscode.env, 'appName').value('Cursor')
        assert.strictEqual(getSshPrefix('sm_lc'), 'smc_')
        assert.strictEqual(getSshPrefix('sm_dl'), 'smc_')
    })

    it('returns smhp_ for hyperpod connection regardless of IDE', function () {
        sandbox.stub(vscode.env, 'appName').value('Visual Studio Code')
        assert.strictEqual(getSshPrefix('sm_hp'), 'smhp_')
    })

    it('returns sm_ for unknown IDE type', function () {
        sandbox.stub(vscode.env, 'appName').value('SomeOtherIDE')
        assert.strictEqual(getSshPrefix('sm_lc'), 'sm_')
    })
})

describe('isValidSshHostname', function () {
    it('accepts valid lowercase alphanumeric hostname', function () {
        assert.strictEqual(isValidSshHostname('myworkspace'), true)
    })

    it('accepts hostname with underscores, dots, and hyphens', function () {
        assert.strictEqual(isValidSshHostname('workspace_ns_cluster_us-east-1_123456789012'), true)
    })

    it('rejects hostname starting with a hyphen', function () {
        assert.strictEqual(isValidSshHostname('-invalid'), false)
    })

    it('rejects hostname with uppercase characters', function () {
        assert.strictEqual(isValidSshHostname('MyWorkspace'), false)
    })

    it('rejects empty string', function () {
        assert.strictEqual(isValidSshHostname(''), false)
    })

    it('accepts single character hostname', function () {
        assert.strictEqual(isValidSshHostname('a'), true)
    })

    it('rejects hostname ending with a hyphen', function () {
        assert.strictEqual(isValidSshHostname('invalid-'), false)
    })
})

describe('createValidSshSession', function () {
    it('constructs hostname from workspace, namespace, cluster, region, and accountId', function () {
        const result = createValidSshSession('myworkspace', 'mynamespace', 'mycluster', 'us-east-1', '123456789012')
        assert.strictEqual(result, 'myworkspace_mynamespace_mycluster_us-east-1_123456789012')
    })

    it('sanitizes uppercase to lowercase', function () {
        const result = createValidSshSession('MyWork', 'MyNS', 'MyCluster', 'US-EAST-1', '123456789012')
        assert.strictEqual(result, 'mywork_myns_mycluster_us-east-1_123456789012')
    })

    it('strips invalid characters', function () {
        const result = createValidSshSession('work space!', 'ns@special', 'cluster#1', 'us-east-1', '123456789012')
        assert.strictEqual(result, 'workspace_nsspecial_cluster1_us-east-1_123456789012')
    })

    it('truncates long components', function () {
        const longName = 'a'.repeat(100)
        const result = createValidSshSession(longName, 'ns', 'cluster', 'us-east-1', '123456789012')
        // workspaceName truncated to 63
        assert.ok(result.startsWith('a'.repeat(63) + '_'))
    })

    it('filters out empty components after sanitization', function () {
        const result = createValidSshSession('workspace', '!!!', 'cluster', 'us-east-1', '123456789012')
        // '!!!' sanitizes to empty string and gets filtered out
        assert.strictEqual(result, 'workspace_cluster_us-east-1_123456789012')
    })

    it('produces a valid SSH hostname', function () {
        const result = createValidSshSession('myworkspace', 'mynamespace', 'mycluster', 'us-east-1', '123456789012')
        assert.strictEqual(isValidSshHostname(result), true)
    })
})

describe('extractRegionFromStreamUrl', function () {
    it('extracts region from a standard SSM stream URL', function () {
        assert.strictEqual(
            extractRegionFromStreamUrl('wss://ssmmessages.us-west-2.amazonaws.com/v1/data-channel/session-id'),
            'us-west-2'
        )
    })

    it('extracts region from a different region', function () {
        assert.strictEqual(
            extractRegionFromStreamUrl('wss://ssmmessages.eu-central-1.amazonaws.com/v1/data-channel/session-id'),
            'eu-central-1'
        )
    })

    it('throws for non-matching URL', function () {
        assert.throws(() => extractRegionFromStreamUrl('wss://example.com/stream'), /Unable to get region/)
    })
})
