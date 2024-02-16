/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'assert'
import * as sinon from 'sinon'
import * as path from 'path'
import * as vscode from 'vscode'
import * as http from 'http'
import { ToolkitError } from '../../shared/errors'
import { Result } from '../../shared/utilities/result'
import { ChildProcess, ChildProcessResult } from '../../shared/utilities/childProcess'
import { SshConfig, ensureConnectScript, sshLogFileLocation } from '../../shared/sshConfig'
import { FakeExtensionContext } from '../fakeExtensionContext'
import { fileExists, makeTemporaryToolkitFolder } from '../../shared/filesystemUtilities'
import {
    DevEnvironmentId,
    bearerTokenCacheLocation,
    connectScriptPrefix,
    getCodeCatalystSsmEnv,
} from '../../codecatalyst/model'
import { StartDevEnvironmentSessionRequest } from 'aws-sdk/clients/codecatalyst'
import { mkdir, readFile, writeFile } from 'fs-extra'
import { SystemUtilities } from '../../shared/systemUtilities'

class MockSshConfig extends SshConfig {
    // State variables to track logic flow.
    public testIsWin: boolean = false
    public configSection: string = ''

    public async getProxyCommandWrapper(command: string): Promise<Result<string, ToolkitError>> {
        return await this.getProxyCommand(command)
    }

    public async testMatchSshSection(testSection: string) {
        this.configSection = testSection
        const result = await this.matchSshSection()
        this.configSection = ''
        return result
    }

    public async testVerifySshHostWrapper(proxyCommand: string, testSection: string) {
        this.configSection = testSection
        const result = this.verifySSHHost(proxyCommand)
        this.configSection = ''
        return result
    }

    protected override isWin() {
        return this.testIsWin
    }

    protected override async checkSshOnHost(): Promise<ChildProcessResult> {
        return {
            exitCode: 0,
            error: undefined,
            stdout: this.configSection,
            stderr: '',
        }
    }

    public createSSHConfigSectionWrapper(proxyCommand: string): string {
        return this.createSSHConfigSection(proxyCommand)
    }
}

describe('VscodeRemoteSshConfig', async function () {
    let config: MockSshConfig

    const testCommand = 'test_connect'
    const testProxyCommand = `'${testCommand}' '%h'`

    before(function () {
        config = new MockSshConfig('sshPath', 'testHostNamePrefix', testCommand)
        config.testIsWin = false
    })

    describe('getProxyCommand', async function () {
        it('returns correct proxyCommand on non-windows', async function () {
            config.testIsWin = false
            const result = await config.getProxyCommandWrapper(testCommand)
            assert.ok(result.isOk())
            const command = result.unwrap()
            assert.strictEqual(command, testProxyCommand)
        })
    })

    describe('matchSshSection', async function () {
        it('returns ok with match when proxycommand is present', async function () {
            const testSection = `proxycommandfdsafdsafd${testProxyCommand}sa342432`
            const result = await config.testMatchSshSection(testSection)
            assert.ok(result.isOk())
            const match = result.unwrap()
            assert.ok(match)
        })

        it('returns ok result with undefined inside when proxycommand is not present', async function () {
            const testSection = `fdsafdsafdsa342432`
            const result = await config.testMatchSshSection(testSection)
            assert.ok(result.isOk())
            const match = result.unwrap()
            assert.strictEqual(match, undefined)
        })
    })

    describe('verifySSHHost', async function () {
        let promptUserToConfigureSshConfigStub: sinon.SinonStub<
            [configSection: string | undefined, proxyCommand: string],
            Promise<void>
        >
        before(function () {
            promptUserToConfigureSshConfigStub = sinon.stub(SshConfig.prototype, 'promptUserToConfigureSshConfig')
        })

        beforeEach(function () {
            promptUserToConfigureSshConfigStub.resetHistory()
        })

        after(function () {
            sinon.restore()
        })

        it('writes to ssh config if command not found.', async function () {
            const testSection = 'no-command-here'
            const result = await config.testVerifySshHostWrapper(testCommand, testSection)

            assert.ok(result.isOk())
            sinon.assert.calledOn(promptUserToConfigureSshConfigStub, config)
            sinon.assert.calledOnce(promptUserToConfigureSshConfigStub)
        })

        it('does not write to ssh config if command is find', async function () {
            const testSection = `this is some text that doesn't matter, but here proxycommand ${testProxyCommand}`
            const result = await config.testVerifySshHostWrapper(testCommand, testSection)

            assert.ok(result.isOk())
            sinon.assert.notCalled(promptUserToConfigureSshConfigStub)
        })
    })

    describe('createSSHConfigSection', async function () {
        const testKeyPath = 'path/to/keys'
        const newConfig = new MockSshConfig('sshPath', 'testHostNamePrefix', 'someScript', testKeyPath)
        const expectedUserString = `User '%r'`
        const expectedIdentityFileString = `IdentityFile '${testKeyPath}'`

        it('section includes relevant script prefix', function () {
            const testScriptName = 'testScript'
            const section = config.createSSHConfigSectionWrapper(testScriptName)
            assert.ok(section.includes(testScriptName))
        })

        it('includes keyPath if included in the class', function () {
            const section = newConfig.createSSHConfigSectionWrapper('proxyCommand')
            assert.ok(section.match(expectedIdentityFileString))
        })

        it('parses the remote username from the ssh execution', function () {
            const section = newConfig.createSSHConfigSectionWrapper('proxyCommand')
            assert.ok(section.match(expectedUserString))
        })

        it('omits User and IdentityFile fields when keyPath not given', function () {
            const section = config.createSSHConfigSectionWrapper('proxyCommand')
            assert.ok(!section.match(expectedUserString))
            assert.ok(!section.match(expectedIdentityFileString))
        })
    })

    describe('sshLogFileLocation', async function () {
        it('combines service and id into proper log file', function () {
            const testService = 'testScript'
            const testId = 'id'
            const result = sshLogFileLocation(testService, testId)

            assert.ok(result.includes(testService))
            assert.ok(result.includes(testId))
            assert.ok(result.endsWith('.log'))
        })
    })
})

describe('CodeCatalyst Connect Script', function () {
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
        const script = (await ensureConnectScript(connectScriptPrefix, context)).unwrap().fsPath
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
        const script = (await ensureConnectScript(connectScriptPrefix, context)).unwrap().fsPath
        const env = getCodeCatalystSsmEnv('us-weast-1', 'echo', testDevEnv)
        env.CODECATALYST_ENDPOINT = address

        // This could be de-duped
        const isWindows = process.platform === 'win32'
        const cmd = isWindows ? 'powershell.exe' : script
        const args = isWindows ? ['-ExecutionPolicy', 'Bypass', '-File', script, 'bar'] : [script, 'bar']

        const output = await new ChildProcess(cmd, args).run({ spawnOptions: { env } })
        if (output.exitCode !== 0) {
            const logOutput = sshLogFileLocation('codecatalyst', testDevEnv.id)
            const message = `stderr:\n${output.stderr}\n\nlogs:\n${await readFile(logOutput)}`

            assert.fail(`Connect script should exit with a zero status:\n${message}`)
        }
    })

    describe('~/.ssh', function () {
        let tmpDir: string

        beforeEach(async function () {
            tmpDir = await makeTemporaryToolkitFolder()
            sinon.stub(SystemUtilities, 'getHomeDirectory').returns(tmpDir)
        })

        afterEach(async function () {
            sinon.restore()
            await SystemUtilities.delete(tmpDir, { recursive: true })
        })

        it('works if the .ssh directory is missing', async function () {
            ;(await ensureConnectScript(connectScriptPrefix, context)).unwrap()
        })

        it('works if the .ssh directory exists but has different perms', async function () {
            await mkdir(path.join(tmpDir, '.ssh'), 0o777)
            ;(await ensureConnectScript(connectScriptPrefix, context)).unwrap()
        })
    })
})
