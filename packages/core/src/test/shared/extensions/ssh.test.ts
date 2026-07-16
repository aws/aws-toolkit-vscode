/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as assert from 'assert'
import * as sinon from 'sinon'
import { ChildProcess } from '../../../shared/utilities/processUtils'
import { RemoteSshSettings, startSshAgent, startVscodeRemote, testSshConnection } from '../../../shared/extensions/ssh'
import { createBoundProcess } from '../../../shared/remoteSession'
import { createExecutableFile, createTestWorkspaceFolder } from '../../testUtil'
import { WorkspaceFolder } from 'vscode'
import path from 'path'
import { StartSessionResponse } from '@aws-sdk/client-ssm'
import { fs } from '../../../shared/fs/fs'
import { isWin } from '../../../shared/vscode/env'

describe('SSH Agent', function () {
    it('can start the agent on windows', async function () {
        this.retries(2)

        // TODO: we should also skip this test if not running in CI
        // Local machines probably won't have admin permissions in the spawned processes
        if (process.platform !== 'win32') {
            this.skip()
        }

        async function runCommand(command: string) {
            const args = ['-NoLogo', '-NonInteractive', '-ExecutionPolicy', 'RemoteSigned', '-Command', command]
            return await new ChildProcess('pwsh.exe', args).run({ rejectOnErrorCode: true })
        }

        async function getStatus() {
            const c = await runCommand('echo (Get-Service ssh-agent).Status')
            return c.stdout
        }

        await runCommand('Stop-Service ssh-agent')
        assert.strictEqual(await getStatus(), 'Stopped')
        await startSshAgent()
        assert.strictEqual(await getStatus(), 'Running')
    })
})

function echoEnvVarsCmd(varNames: string[]) {
    const toShell = (s: string) => (isWin() ? `%${s}%` : `$${s}`)
    return `echo "${varNames.map(toShell).join(' ')}"`
}

/**
 * Trim noisy windows ChildProcess result to final line for easier testing.
 */
function assertOutputContains(rawOutput: string, expectedString: string): void | never {
    const output = rawOutput.trim().split('\n').at(-1)?.replace('"', '') ?? ''
    assert.ok(output.includes(expectedString), `Expected output to contain "${expectedString}", but got "${output}"`)
}

describe('testSshConnection', function () {
    let testWorkspace: WorkspaceFolder
    let sshPath: string

    before(async function () {
        testWorkspace = await createTestWorkspaceFolder()
        sshPath = path.join(testWorkspace.uri.fsPath, `fakeSSH${isWin() ? '.cmd' : ''}`)
    })

    after(async function () {
        await fs.delete(testWorkspace.uri.fsPath, { recursive: true, force: true })
        await fs.delete(sshPath, { force: true })
    })

    it('runs in bound process', async function () {
        const envProvider = async () => ({ MY_VAR: 'yes' })
        const process = createBoundProcess(envProvider)
        const session = {
            SessionId: 'testSession',
            StreamUrl: 'testUrl',
            TokenValue: 'testToken',
        } as StartSessionResponse

        await createExecutableFile(sshPath, echoEnvVarsCmd(['MY_VAR']))
        const r = await testSshConnection(process, 'localhost', sshPath, 'test-user', session)
        assertOutputContains(r.stdout, 'yes')
    })

    it('injects new session into env', async function () {
        const oldSession = {
            SessionId: 'testSession1',
            StreamUrl: 'testUrl1',
            TokenValue: 'testToken1',
        } as StartSessionResponse
        const newSession = {
            SessionId: 'testSession2',
            StreamUrl: 'testUrl2',
            TokenValue: 'testToken2',
        } as StartSessionResponse
        const envProvider = async () => ({
            SESSION_ID: oldSession.SessionId,
            STREAM_URL: oldSession.StreamUrl,
            TOKEN: oldSession.TokenValue,
        })
        const process = createBoundProcess(envProvider)

        await createExecutableFile(sshPath, echoEnvVarsCmd(['SESSION_ID', 'STREAM_URL', 'TOKEN']))
        const r = await testSshConnection(process, 'localhost', sshPath, 'test-user', newSession)
        assertOutputContains(r.stdout, `${newSession.SessionId} ${newSession.StreamUrl} ${newSession.TokenValue}`)
    })

    it('passes proper args to the ssh invoke', async function () {
        const executableFileContent = isWin() ? `echo "%1 %2"` : `echo "$1 $2"`
        const process = createBoundProcess(async () => ({}))
        await createExecutableFile(sshPath, executableFileContent)
        const r = await testSshConnection(process, 'localhost', sshPath, 'test-user', {} as StartSessionResponse)
        assertOutputContains(r.stdout, '-T')
        assertOutputContains(r.stdout, 'test-user@localhost')
    })
})

describe('startVscodeRemote', function () {
    let sandbox: sinon.SinonSandbox
    let mockProcessInstance: { run: sinon.SinonStub }
    let MockProcessClass: sinon.SinonStub
    let setRemotePlatformStub: sinon.SinonStub
    let updateStub: sinon.SinonStub
    let getStub: sinon.SinonStub

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        mockProcessInstance = { run: sandbox.stub().resolves() }
        MockProcessClass = sandbox.stub().returns(mockProcessInstance)
        sandbox.stub(RemoteSshSettings.prototype, 'ensureDefaultExtension').resolves(true)
        setRemotePlatformStub = sandbox.stub(RemoteSshSettings.prototype, 'setRemotePlatform').resolves(true)
        updateStub = sandbox.stub(RemoteSshSettings.prototype, 'update').resolves(true)
        getStub = sandbox.stub(RemoteSshSettings.prototype, 'get')
        getStub.returns('')
    })

    afterEach(function () {
        sandbox.restore()
    })

    it('launches vscode with correct folder-uri', async function () {
        await startVscodeRemote(MockProcessClass as any, 'my_host', '/home/user', '/usr/bin/code')

        sinon.assert.calledOnce(MockProcessClass)
        const args = MockProcessClass.firstCall.args
        assert.strictEqual(args[0], '/usr/bin/code')
        assert.deepStrictEqual(args[1], ['--folder-uri', 'vscode-remote://ssh-remote+my_host/home/user'])
    })

    it('includes user@ in URI when user is provided', async function () {
        await startVscodeRemote(MockProcessClass as any, 'my_host', '/home/user', '/usr/bin/code', 'sagemaker-user')

        const uri = MockProcessClass.firstCall.args[1][1]
        assert.strictEqual(uri, 'vscode-remote://ssh-remote+sagemaker-user@my_host/home/user')
    })

    describe('on Windows', function () {
        beforeEach(function () {
            sandbox.stub(process, 'platform').value('win32')
        })

        it('sets useLocalServer=true for SageMaker host (sm_ prefix)', async function () {
            await startVscodeRemote(MockProcessClass as any, 'sm_dl_my_space', '/home/user', '/usr/bin/code')

            sinon.assert.calledWith(updateStub, 'useLocalServer', true)
        })

        it('sets useLocalServer=true for SageMaker Cursor host (smc_ prefix)', async function () {
            await startVscodeRemote(MockProcessClass as any, 'smc_dl_my_space', '/home/user', '/usr/bin/code')

            sinon.assert.calledWith(updateStub, 'useLocalServer', true)
        })

        it('sets useLocalServer=true for HyperPod host (smhp_ prefix)', async function () {
            await startVscodeRemote(
                MockProcessClass as any,
                'smhp_workspace_ns_cluster_useast1_123',
                '/home/user',
                '/usr/bin/code'
            )

            sinon.assert.calledWith(updateStub, 'useLocalServer', true)
        })

        it('sets useLocalServer=true for HyperPod Cursor host (smhpc_ prefix)', async function () {
            await startVscodeRemote(
                MockProcessClass as any,
                'smhpc_workspace_ns_cluster_useast1_123',
                '/home/user',
                '/usr/bin/code'
            )

            sinon.assert.calledWith(updateStub, 'useLocalServer', true)
        })

        it('sets useLocalServer=false for non-SageMaker host', async function () {
            await startVscodeRemote(MockProcessClass as any, 'ec2_my_instance', '/home/user', '/usr/bin/code')

            sinon.assert.calledWith(updateStub, 'useLocalServer', false)
        })

        it('sets remotePlatform to linux for any host', async function () {
            await startVscodeRemote(MockProcessClass as any, 'sm_dl_my_space', '/home/user', '/usr/bin/code')

            sinon.assert.calledWith(setRemotePlatformStub, 'sm_dl_my_space', 'linux')
        })

        it('sets SSH path for SageMaker host when path is empty', async function () {
            getStub.withArgs('path', '').returns('')

            await startVscodeRemote(MockProcessClass as any, 'sm_dl_my_space', '/home/user', '/usr/bin/code')

            sinon.assert.calledWith(updateStub, 'path', 'C:\\Windows\\System32\\OpenSSH\\ssh.exe')
        })

        it('does not override existing SSH path for SageMaker host', async function () {
            getStub.withArgs('path', '').returns('C:\\custom\\ssh.exe')

            await startVscodeRemote(MockProcessClass as any, 'sm_dl_my_space', '/home/user', '/usr/bin/code')

            sinon.assert.neverCalledWith(updateStub, 'path', sinon.match.any)
        })

        it('does not set SSH path for non-SageMaker host', async function () {
            getStub.withArgs('path', '').returns('')

            await startVscodeRemote(MockProcessClass as any, 'ec2_my_instance', '/home/user', '/usr/bin/code')

            sinon.assert.neverCalledWith(updateStub, 'path', sinon.match.any)
        })
    })
})
