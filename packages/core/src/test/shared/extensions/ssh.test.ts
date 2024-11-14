/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as assert from 'assert'
import { ChildProcess } from '../../../shared/utilities/processUtils'
import { getSshVersion, startSshAgent } from '../../../shared/extensions/ssh'
import { createExecutableFile, createTestWorkspaceFolder } from '../../testUtil'
import { isWin } from '../../../shared/vscode/env'
import path from 'path'
import { fs } from '../../../shared'

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

    it('gets ssh version from path', async function () {
        const tempDir = await createTestWorkspaceFolder()

        const testSshVersion = async (
            sshName: string,
            sshOutput: string,
            expectedVersion: { major: number; minor: number }
        ) => {
            const sshPath = path.join(tempDir.uri.fsPath, `${sshName}${isWin() ? '.cmd' : ''}`)
            await createExecutableFile(sshPath, `echo "${sshOutput}"`)
            const version = await getSshVersion(sshPath)
            assert.strictEqual(version?.major, expectedVersion.major)
            assert.strictEqual(version?.minor, expectedVersion.minor)
        }

        await testSshVersion('ssh', 'OpenSSH_9.7p1, LibreSSL 3.3.6', { major: 9, minor: 7 })
        await testSshVersion('ssh2', 'OpenSSH_6.6.1p1, OpenSSL 1.0.1e-fips 11 Feb 2013', { major: 6, minor: 6 })
        await testSshVersion('ssh3', 'OpenSSH_7.4p1, OpenSSL 1.0.1e-fips 11 Feb 2013', { major: 7, minor: 4 })

        await fs.delete(tempDir.uri.fsPath, { force: true, recursive: true })
    })
})
