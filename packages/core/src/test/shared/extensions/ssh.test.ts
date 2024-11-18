/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as assert from 'assert'
import { ChildProcess } from '../../../shared/utilities/processUtils'
import { startSshAgent, testSshConnection } from '../../../shared/extensions/ssh'
import { createBoundProcess } from '../../../shared/remoteSession'
import { createExecutableFile, createTestWorkspaceFolder } from '../../testUtil'
import { WorkspaceFolder } from 'vscode'
import path from 'path'
import { SSM } from 'aws-sdk'
import { fs } from '../../../shared/fs/fs'

describe('SSH Agent', function () {
    it('can start the agent on windows', async function () {
        // TODO: we should also skip this test if not running in CI
        // Local machines probably won't have admin permissions in the spawned processes
        if (process.platform !== 'win32') {
            this.skip()
        }

        const runCommand = (command: string) => {
            const args = ['-Command', command]
            return new ChildProcess('powershell.exe', args).run({ rejectOnErrorCode: true })
        }

        const getStatus = () => {
            return runCommand('echo (Get-Service ssh-agent).Status').then((o) => o.stdout)
        }

        await runCommand('Stop-Service ssh-agent')
        assert.strictEqual(await getStatus(), 'Stopped')
        await startSshAgent()
        assert.strictEqual(await getStatus(), 'Running')
    })
})

describe('testSshConnection', function () {
    let testWorkspace: WorkspaceFolder
    let sshPath: string

    before(async function () {
        testWorkspace = await createTestWorkspaceFolder()
        sshPath = path.join(testWorkspace.uri.fsPath, 'fakeSSH')
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
        } as SSM.StartSessionResponse

        await createExecutableFile(sshPath, 'echo "$MY_VAR"')
        const r = await testSshConnection(process, 'localhost', sshPath, 'test-user', session)
        assert.strictEqual(r.stdout, 'yes')
        await createExecutableFile(sshPath, 'echo "$UNDEFINED"')
        const r2 = await testSshConnection(process, 'localhost', sshPath, 'test-user', session)
        assert.strictEqual(r2.stdout, '')
    })

    it('injects new session into env', async function () {
        const oldSession = {
            SessionId: 'testSession1',
            StreamUrl: 'testUrl1',
            TokenValue: 'testToken1',
        } as SSM.StartSessionResponse
        const newSession = {
            SessionId: 'testSession2',
            StreamUrl: 'testUrl2',
            TokenValue: 'testToken2',
        } as SSM.StartSessionResponse
        const envProvider = async () => ({
            SESSION_ID: oldSession.SessionId,
            STREAM_URL: oldSession.StreamUrl,
            TOKEN: oldSession.TokenValue,
        })
        const process = createBoundProcess(envProvider)

        await createExecutableFile(sshPath, 'echo "$SESSION_ID, $STREAM_URL, $TOKEN"')
        const r = await testSshConnection(process, 'localhost', sshPath, 'test-user', newSession)
        assert.strictEqual(r.stdout, `${newSession.SessionId}, ${newSession.StreamUrl}, ${newSession.TokenValue}`)
    })

    it('passes proper args to the ssh invoke', async function () {
        const process = createBoundProcess(async () => ({}))
        await createExecutableFile(sshPath, 'echo "$1,$2"')
        const r = await testSshConnection(process, 'localhost', sshPath, 'test-user', {} as SSM.StartSessionResponse)
        assert.strictEqual(r.stdout, '-T,test-user@localhost')
    })
})
