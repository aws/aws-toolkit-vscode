/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as assert from 'assert'
import { VscodeRemoteSshConfig } from '../../../shared/extensions/ssh'
import { ToolkitError } from '../../../shared/errors'
import { Err, Ok, Result } from '../../../shared/utilities/result'
import { ChildProcessResult } from '../../../shared/utilities/childProcess'

const testCommand = 'run-thing'

class MockSshConfig extends VscodeRemoteSshConfig {
    private readonly testCommand: string = testCommand
    protected readonly proxyCommandRegExp: RegExp = /run-thing/

    public testIsWin: boolean = false
    public configSection: string = ''

    protected override createSSHConfigSection(proxyCommand: string): string {
        return 'test-config-section'
    }

    public override async ensureValid(): Promise<Err<ToolkitError> | Err<Error> | Ok<void>> {
        const proxyCommand = await this.getProxyCommand(this.testCommand)
        if (proxyCommand.isErr()) {
            return proxyCommand
        }

        const section = this.createSSHConfigSection(proxyCommand.unwrap())

        const verifyHost = await this.verifySSHHost({ proxyCommand: proxyCommand.unwrap(), section })
        if (verifyHost.isErr()) {
            return verifyHost
        }

        return Result.ok()
    }

    public async getProxyCommandWrapper(command: string): Promise<Result<string, ToolkitError>> {
        return await this.getProxyCommand(command)
    }

    public async matchSshSectionWrapper() {
        return await this.matchSshSection()
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
}

describe('VscodeRemoteSshConfig', async function () {
    let config: MockSshConfig
    before(function () {
        config = new MockSshConfig('sshPath', 'testHostNamePrefix')
        config.testIsWin = false
    })

    describe('getProxyCommand', async function () {
        it('returns correct proxyCommand on non-windows', async function () {
            config.testIsWin = false
            const result = await config.getProxyCommandWrapper(testCommand)
            assert.ok(result.isOk())
            const command = result.unwrap()
            assert.strictEqual(command, `'${testCommand}' '%h'`)
        })
    })

    describe('matchSshSection', async function () {
        it('returns ok with match when proxycommand is present', async function () {
            config.configSection = 'fdsafdsafdsarun-thing342432'
            const result = await config.matchSshSectionWrapper()
            assert.ok(result.isOk())
            const match = result.unwrap()
            assert.ok(match)
        })

        it('returns ok with undefined when proxycommand is not present', async function () {
            config.configSection = 'fdsafdsafdsa342432'
            const result = await config.matchSshSectionWrapper()
            assert.ok(result.isOk())
            const match = result.unwrap()
            assert.strictEqual(match, undefined)
        })
    })
})
