/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as assert from 'assert'
import * as sinon from 'sinon'
import { ToolkitError } from '../../shared/errors'
import { Result } from '../../shared/utilities/result'
import { ChildProcessResult } from '../../shared/utilities/childProcess'
import { VscodeRemoteSshConfig, sshLogFileLocation } from '../../shared/sshConfig'

class MockSshConfig extends VscodeRemoteSshConfig {
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
    let promptUserToConfigureSshConfigStub: sinon.SinonStub<
        [configSection: string | undefined, proxyCommand: string],
        Promise<void>
    >

    const testCommand = 'test_connect'
    const testProxyCommand = `'${testCommand}' '%h'`
    before(function () {
        config = new MockSshConfig('sshPath', 'testHostNamePrefix', testCommand)
        config.testIsWin = false
        promptUserToConfigureSshConfigStub = sinon.stub(
            VscodeRemoteSshConfig.prototype,
            'promptUserToConfigureSshConfig'
        )
    })

    after(function () {
        sinon.restore()
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
        beforeEach(function () {
            promptUserToConfigureSshConfigStub.resetHistory()
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
