/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as assert from 'assert'
import { ToolkitError } from '../../shared/errors'
import { Err, Ok, Result } from '../../shared/utilities/result'
import { ChildProcessResult } from '../../shared/utilities/childProcess'
import { VscodeRemoteSshConfig } from '../../shared/sshConfig'

class MockSshConfig extends VscodeRemoteSshConfig {
    // State variables to track logic flow.
    public testIsWin: boolean = false
    public configSection: string = ''
    public SshConfigWritten: boolean = false

    public override async ensureValid(): Promise<Err<ToolkitError> | Err<Error> | Ok<void>> {
        const proxyCommand = await this.getProxyCommand(this.scriptPrefix)
        if (proxyCommand.isErr()) {
            return proxyCommand
        }

        const verifyHost = await this.verifySSHHost(proxyCommand.unwrap())
        if (verifyHost.isErr()) {
            return verifyHost
        }

        return Result.ok()
    }

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

    protected override async promptUserToConfigureSshConfig(
        configSection: string | undefined,
        section: string
    ): Promise<void> {
        this.SshConfigWritten = true
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

        it('returns ok with undefined when proxycommand is not present', async function () {
            const testSection = `fdsafdsafdsa342432`
            const result = await config.testMatchSshSection(testSection)
            assert.ok(result.isOk())
            const match = result.unwrap()
            assert.strictEqual(match, undefined)
        })
    })

    describe('verifySSHHost', async function () {
        beforeEach(function () {
            config.SshConfigWritten = false
        })

        it('writes to ssh config if command not found.', async function () {
            const testSection = 'no-command-here'
            const result = await config.testVerifySshHostWrapper(testCommand, testSection)

            assert.ok(result.isOk())
            assert.ok(config.SshConfigWritten)
        })

        it('does not write to ssh config if command is find', async function () {
            const testSection = `this is some text that doesn't matter, but here proxycommand ${testProxyCommand}`
            const result = await config.testVerifySshHostWrapper(testCommand, testSection)

            assert.ok(result.isOk())
            assert.ok(!config.SshConfigWritten)
        })
    })

    describe('createSSHConfigSection', async function () {
        it('section includes relevant script prefix', function () {
            const testScriptName = 'testScript'
            const section = config.createSSHConfigSectionWrapper(testScriptName)
            assert.ok(section.includes(testScriptName))
        })
    })
})
