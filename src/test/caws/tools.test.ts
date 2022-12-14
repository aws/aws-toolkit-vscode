/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as path from 'path'
import * as http from 'http'
import * as assert from 'assert'
import { fileExists, makeTemporaryToolkitFolder } from '../../shared/filesystemUtilities'
import { ChildProcess } from '../../shared/utilities/childProcess'
import { FakeExtensionContext } from '../fakeExtensionContext'
import { startSshAgent } from '../../shared/extensions/ssh'
import { ensureConnectScript } from '../../codecatalyst/tools'
import {
    bearerTokenCacheLocation,
    DevEnvironmentId,
    getCodeCatalystSsmEnv,
    sshLogFileLocation,
} from '../../codecatalyst/model'
import { readFile, writeFile } from 'fs-extra'
import { StartDevEnvironmentSessionRequest } from 'aws-sdk/clients/codecatalyst'

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
            return runCommand('echo (Get-Service ssh-agent).Status').then(o => o.stdout)
        }

        await runCommand('Stop-Service ssh-agent')
        assert.strictEqual(await getStatus(), 'Stopped')
        await startSshAgent()
        assert.strictEqual(await getStatus(), 'Running')
    })
})

describe('Connect Script', function () {
    let context: FakeExtensionContext

    function isWithin(path1: string, path2: string): boolean {
        const rel = path.relative(path1, path2)
        return !path.isAbsolute(rel) && !rel.startsWith('..') && !!rel
    }

    beforeEach(async function () {
        context = await FakeExtensionContext.create()
        context.globalStorageUri = vscode.Uri.file(await makeTemporaryToolkitFolder())
    })

    it('can get a connect script path, adding a copy to global storage', async function () {
        const script = (await ensureConnectScript(context)).unwrap().fsPath
        assert.ok(await fileExists(script))
        assert.ok(isWithin(context.globalStorageUri.fsPath, script))
    })

    function createFakeServer(testDevEnv: DevEnvironmentId) {
        return http.createServer(async (req, resp) => {
            try {
                const data = await new Promise<string>((resolve, reject) => {
                    req.on('error', reject)
                    req.on('data', d => resolve(d.toString()))
                })

                const body = JSON.parse(data)
                const expected: Pick<StartDevEnvironmentSessionRequest, 'sessionConfiguration'> = {
                    sessionConfiguration: { sessionType: 'SSH' },
                }

                const expectedPath = `/v1/spaces/${testDevEnv.org.name}/projects/${testDevEnv.project.name}/devEnvironments/${testDevEnv.id}/session`

                assert.deepStrictEqual(body, expected)
                assert.strictEqual(req.url, expectedPath)
            } catch (e) {
                resp.writeHead(400, { 'Content-Type': 'application/json' })
                resp.end(JSON.stringify({ name: 'ValidationException', message: (e as Error).message }))

                return
            }

            resp.writeHead(200, { 'Content-Type': 'application/json' })
            resp.end(
                JSON.stringify({
                    tokenValue: 'a token',
                    streamUrl: 'some url',
                    sessionId: 'an id',
                })
            )
        })
    }

    it('can run the script with environment variables', async function () {
        const testDevEnv: DevEnvironmentId = {
            id: '01234567890',
            project: { name: 'project' },
            org: { name: 'org' },
        }

        const server = createFakeServer(testDevEnv)
        const address = await new Promise<string>((resolve, reject) => {
            server.on('error', reject)
            server.listen({ host: 'localhost', port: 28142 }, () => resolve(`http://localhost:28142`))
        })

        await writeFile(bearerTokenCacheLocation(testDevEnv.id), 'token')
        const script = (await ensureConnectScript(context)).unwrap().fsPath
        const env = getCodeCatalystSsmEnv('us-weast-1', 'echo', testDevEnv)
        env.CODECATALYST_ENDPOINT = address

        // This could be de-duped
        const isWindows = process.platform === 'win32'
        const cmd = isWindows ? 'powershell.exe' : script
        const args = isWindows ? ['-ExecutionPolicy', 'Bypass', '-File', script, 'bar'] : [script, 'bar']

        const output = await new ChildProcess(cmd, args).run({ spawnOptions: { env } })
        if (output.exitCode !== 0) {
            const logOutput = sshLogFileLocation(testDevEnv.id)
            const message = `stderr:\n${output.stderr}\n\nlogs:\n${await readFile(logOutput)}`

            assert.fail(`Connect script should exit with a zero status:\n${message}`)
        }
    })
})
