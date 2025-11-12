/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'assert'
import * as sinon from 'sinon'
import * as path from 'path'
import { ToolkitError } from '../../../shared/errors'
import { Result } from '../../../shared/utilities/result'
import { SageMakerSshConfig } from '../../../awsService/sagemaker/sshConfig'
import { makeTemporaryToolkitFolder } from '../../../shared/filesystemUtilities'
import { CancellationError } from '../../../shared/utilities/timeoutUtils'
import fs from '../../../shared/fs/fs'
import { getTestWindow } from '../../shared/vscode/window'

describe('SageMakerSshConfig', function () {
    let sandbox: sinon.SinonSandbox
    let config: SageMakerSshConfig
    let tempDir: string
    let sshConfigPath: string
    const testProxyCommand = "'sagemaker_connect' '%n'"

    beforeEach(async function () {
        sandbox = sinon.createSandbox()
        tempDir = await makeTemporaryToolkitFolder()
        sshConfigPath = path.join(tempDir, 'config')

        // Mock getSshConfigPath to use temp directory
        sandbox.stub(require('../../../shared/extensions/ssh'), 'getSshConfigPath').returns(sshConfigPath)

        config = new SageMakerSshConfig('/usr/bin/ssh', 'sm_', 'sagemaker_connect')
    })

    afterEach(async function () {
        sandbox.restore()
        getTestWindow().dispose()
        if (tempDir) {
            await fs.delete(tempDir, { recursive: true })
        }
    })

    async function writeTestSshConfig(content: string): Promise<void> {
        await fs.writeFile(sshConfigPath, content)
    }

    describe('readSshConfigState', function () {
        /**
         * Test: No SSH config file exists
         * Expected: Returns Ok with hasSshSection=false, isOutdated=false
         */
        it('returns Ok with false state when file does not exist', async function () {
            const result = await config.readSshConfigState(testProxyCommand)

            assert.ok(result.isOk())
            const state = result.ok()
            assert.strictEqual(state.hasSshSection, false)
            assert.strictEqual(state.isOutdated, false)
        })

        /**
         * Test: SSH config has sm_* section with old "User '%r'" directive
         * Expected: Returns Ok with hasSshSection=true, isOutdated=true
         */
        it('returns Ok with outdated=true when section has old User field', async function () {
            await writeTestSshConfig(`# Created by AWS Toolkit
Host sm_*
    ProxyCommand 'sagemaker_connect' '%n'
    User '%r'
`)

            const result = await config.readSshConfigState(testProxyCommand)

            assert.ok(result.isOk())
            const state = result.ok()
            assert.strictEqual(state.hasSshSection, true)
            assert.strictEqual(state.isOutdated, true)
        })

        /**
         * Test: SSH config has sm_* section with correct/updated format
         * Expected: Returns Ok with hasSshSection=true, isOutdated=false
         */
        it('returns Ok with outdated=false when section is current', async function () {
            await writeTestSshConfig(`# Created by AWS Toolkit
Host sm_*
    ForwardAgent yes
    AddKeysToAgent yes
    StrictHostKeyChecking accept-new
    ProxyCommand 'sagemaker_connect' '%n'
`)

            const result = await config.readSshConfigState(testProxyCommand)

            assert.ok(result.isOk())
            const state = result.ok()
            assert.strictEqual(state.hasSshSection, true)
            assert.strictEqual(state.isOutdated, false)
        })

        /**
         * Test: SSH config file doesn't end with newline
         * Expected: Correctly detects section even without trailing newline
         */
        it('handles files without trailing newline (EOF issue)', async function () {
            await fs.writeFile(sshConfigPath, '# Created by AWS Toolkit\nHost sm_*\n    ProxyCommand test', {
                flag: 'w',
            })

            const result = await config.readSshConfigState(testProxyCommand)

            assert.ok(result.isOk())
            assert.strictEqual(result.ok().hasSshSection, true)
        })

        /**
         * Test: SSH config has sm_* section but missing some directives
         * Expected: Detects as outdated because it doesn't match expected format
         */
        it('detects outdated config with different whitespace', async function () {
            await writeTestSshConfig(`# Created by AWS Toolkit
Host sm_*
    ProxyCommand 'sagemaker_connect' '%n'
    ForwardAgent yes
`)

            const result = await config.readSshConfigState(testProxyCommand)

            assert.ok(result.isOk())
            const state = result.ok()
            assert.strictEqual(state.hasSshSection, true)
            assert.strictEqual(state.isOutdated, true)
        })
    })

    describe('verifySSHHost', function () {
        let promptStub: sinon.SinonStub
        let removeStub: sinon.SinonStub
        let writeStub: sinon.SinonStub
        let matchStub: sinon.SinonStub

        beforeEach(function () {
            promptStub = sandbox.stub(config, 'promptToUpdateSshConfig')
            removeStub = sandbox.stub(config, 'removeSshConfigSection')
            writeStub = sandbox.stub(config as any, 'writeSectionToConfig')
            matchStub = sandbox.stub(config as any, 'matchSshSection')
        })

        /**
         * Test: checks for outdated config BEFORE SSH validation
         * Expected: promptToUpdateSshConfig is called before matchSshSection
         */
        it('checks for outdated config BEFORE running SSH validation', async function () {
            await writeTestSshConfig(`# Created by AWS Toolkit
Host sm_*
    ProxyCommand 'sagemaker_connect' '%n'
    User '%r'
`)

            promptStub.resolves(true)

            getTestWindow().onDidShowMessage((message) => {
                if (message.items.some((item) => item.title === 'Update SSH config')) {
                    message.selectItem('Update SSH config')
                }
            })
            removeStub.resolves()
            writeStub.resolves()
            matchStub.resolves(Result.ok(`Host sm_*\n    ProxyCommand ${testProxyCommand}`))

            await config.verifySSHHost(testProxyCommand)

            assert(
                promptStub.calledBefore(matchStub),
                'promptToUpdateSshConfig should be called before matchSshSection'
            )
        })

        /**
         * Test: User accepts the update prompt for outdated config
         * Expected: Removes old section, writes new section, returns Ok
         */
        it('prompts user to update when config is outdated', async function () {
            await writeTestSshConfig(`# Created by AWS Toolkit
Host sm_*
    User '%r'
`)

            // Restore the stub so the actual method runs and shows UI
            promptStub.restore()

            getTestWindow().onDidShowMessage((message) => {
                if (message.items.some((item) => item.title === 'Update SSH config')) {
                    message.selectItem('Update SSH config')
                }
            })

            removeStub.resolves()
            writeStub.resolves()
            // After update, matchSshSection should return section with the proxy command
            matchStub.resolves(Result.ok(`Host sm_*\n    ProxyCommand ${testProxyCommand}`))

            const result = await config.verifySSHHost(testProxyCommand)

            assert.ok(result.isOk(), `Expected Ok but got: ${result.isErr() ? result.err().message : 'unknown'}`)
            assert(removeStub.calledOnce, 'Should remove old section once')
            assert(writeStub.calledOnce, 'Should write new section once')
        })

        /**
         * Test: User clicks "Cancel" when prompted to update outdated config
         * Expected: Returns error with code 'SshConfigUpdateDeclined'
         */
        it('returns error when user declines update', async function () {
            await writeTestSshConfig(`# Created by AWS Toolkit
Host sm_*
    User '%r'
`)

            // User clicks Cancel
            getTestWindow().onDidShowMessage((message) => {
                message.selectItem('Cancel')
            })

            const result = await config.verifySSHHost(testProxyCommand)
            assert.ok(result.isErr())

            const error = result.err()
            assert.ok(error instanceof ToolkitError)

            assert.strictEqual(error.code, 'SshConfigUpdateDeclined')
            assert(promptStub.calledOnce)
            assert(removeStub.notCalled, 'Should not remove section when user declines')
            assert(writeStub.notCalled, 'Should not write section when user declines')
        })

        /**
         * Test: SSH validation fails due to error elsewhere in config (not in sm_* section)
         * Expected: Extracts line number from error, prompts user to fix external error
         */
        it('shows helpful error with line number when external error exists', async function () {
            await writeTestSshConfig(`# Created by AWS Toolkit
Host sm_*
    ForwardAgent yes
    AddKeysToAgent yes
    StrictHostKeyChecking accept-new
    ProxyCommand 'sagemaker_connect' '%n'

Host github.com
    InvalidDirective bad-value
`)

            // Mock SSH validation to fail with line number
            matchStub.resolves(
                Result.err(new Error('~/.ssh/config: line 9: Bad configuration option: InvalidDirective'))
            )

            const promptErrorStub = sandbox.stub(config as any, 'promptOtherSshConfigError')
            promptErrorStub.rejects(new CancellationError('user'))

            const result = await config.verifySSHHost(testProxyCommand)

            assert.ok(result.isErr())
            assert(promptErrorStub.calledOnce, 'Should prompt about external error')

            // Verify error message was passed with line number
            const errorArg = promptErrorStub.firstCall.args[0]
            assert.ok(errorArg.message.includes('line 9'), 'Error should include line number')
        })

        /**
         * Test: Happy path - config is up-to-date and SSH validation succeeds
         * Expected: No prompts shown, validation runs successfully, returns Ok
         */
        it('handles successful validation when config is up-to-date', async function () {
            await writeTestSshConfig(`# Created by AWS Toolkit
Host sm_*
    ForwardAgent yes
    AddKeysToAgent yes
    StrictHostKeyChecking accept-new
    ProxyCommand 'sagemaker_connect' '%n'
`)

            matchStub.resolves(Result.ok("Host sm_*\n    ProxyCommand 'sagemaker_connect' '%n'"))

            const result = await config.verifySSHHost(testProxyCommand)

            assert.ok(result.isOk())
            assert(promptStub.notCalled, 'Should not prompt when config is up-to-date')
            assert(matchStub.calledOnce, 'Should run SSH validation')
        })
    })

    describe('removeSshConfigSection', function () {
        /**
         * Test: Removes only the sm_* section, preserves other sections
         * Expected: sm_* section and toolkit comment removed, other sections intact
         */
        it('removes the sm_* section from config', async function () {
            await writeTestSshConfig(`# Some other config
Host github.com
    User git

# Created by AWS Toolkit
Host sm_*
    ProxyCommand 'sagemaker_connect' '%n'
    User '%r'

Host another.com
    User test
`)

            await config.removeSshConfigSection()

            const content = await fs.readFileText(sshConfigPath)
            assert.ok(!content.includes('Host sm_*'), 'Should remove sm_* section')
            assert.ok(!content.includes('Created by AWS Toolkit'), 'Should remove toolkit comment')
            assert.ok(content.includes('Host github.com'), 'Should keep other sections')
            assert.ok(content.includes('Host another.com'), 'Should keep other sections')
        })

        /**
         * Test: Attempts to remove section when it doesn't exist in config
         * Expected: No error thrown, existing content preserved
         */
        it('handles missing section gracefully', async function () {
            await writeTestSshConfig(`Host github.com
    User git
`)

            await config.removeSshConfigSection()

            const content = await fs.readFileText(sshConfigPath)
            assert.ok(content.includes('Host github.com'), 'Should keep existing content')
        })

        /**
         * Test: Removes section from file without trailing newline (EOF edge case)
         * Expected: Section removed correctly even without trailing newline
         */
        it('handles files without trailing newline', async function () {
            await fs.writeFile(sshConfigPath, '# Created by AWS Toolkit\nHost sm_*\n    ProxyCommand test', {
                flag: 'w',
            })

            await config.removeSshConfigSection()

            const content = await fs.readFileText(sshConfigPath)
            assert.strictEqual(content.trim(), '', 'Should remove section even without trailing newline')
        })
    })

    describe('promptOtherSshConfigError', function () {
        /**
         * Test: SSH error message contains line number (e.g., "line 42")
         * Expected: Extracts line number and includes it in error message to user
         */
        it('extracts and displays line number from SSH error', async function () {
            // Create the SSH config file so it can be opened
            await writeTestSshConfig(`# Some SSH config
Host github.com
    User git
`)

            const sshError = new Error('~/.ssh/config: line 42: Bad configuration option: InvalidDirective')

            getTestWindow().onDidShowMessage((message) => {
                assert.ok(message.message.includes('line 42'), 'Should include line number in error message')
                message.selectItem('Open SSH Config')
            })

            await config.promptOtherSshConfigError(sshError)

            const messages = getTestWindow().shownMessages
            assert(messages.length > 0, 'Should show error message')
        })

        /**
         * Test: User clicks "Cancel" when prompted about external SSH error
         * Expected: Throws CancellationError to signal user cancellation
         */
        it('throws CancellationError when user cancels', async function () {
            const sshError = new Error('SSH error')

            getTestWindow().onDidShowMessage((message) => {
                message.selectItem('Cancel')
            })

            try {
                await config.promptOtherSshConfigError(sshError)
                assert.fail('Should have thrown CancellationError')
            } catch (e) {
                assert.ok(e instanceof CancellationError)
            }
        })

        /**
         * Test: User clicks "Open SSH Config" to fix external error
         * Expected: Opens SSH config file in editor, no error thrown
         */
        it('opens SSH config file when user clicks Open', async function () {
            // Create the SSH config file
            await writeTestSshConfig(`# Some SSH config
Host github.com
    User git
`)

            const sshError = new Error('SSH error')

            getTestWindow().onDidShowMessage((message) => {
                message.selectItem('Open SSH Config')
            })

            await config.promptOtherSshConfigError(sshError)

            const messages = getTestWindow().shownMessages
            assert(messages.length > 0, 'Should show error message')
        })
    })

    describe('error handling', function () {
        /**
         * Test: Error occurs during config update (e.g., write fails) and user cancels
         * Expected: Returns ToolkitError with code 'SshConfigUpdateFailed'
         */
        it('returns proper error when update fails and user cancels', async function () {
            await writeTestSshConfig(`# Created by AWS Toolkit
Host sm_*
    User '%r'
`)

            sandbox.stub(config, 'promptToUpdateSshConfig').resolves(true)
            sandbox.stub(config, 'removeSshConfigSection').rejects(new Error('Write failed'))

            // User cancels the prompt to open the file
            getTestWindow().onDidShowMessage((message) => {
                if (message.items.some((item) => item.title === 'Open SSH Config')) {
                    message.selectItem('Cancel')
                }
            })

            const result = await config.verifySSHHost(testProxyCommand)

            assert.ok(result.isErr())
            const error = result.err()
            assert.ok(error instanceof ToolkitError)
            assert.strictEqual(error.code, 'SshConfigUpdateFailed')
        })

        /**
         * Test: Error occurs during config update and user opens file to fix
         * Expected: Returns ToolkitError with code 'SshConfigOpenedForEdit'
         */
        it('opens config file when update fails and user accepts', async function () {
            await writeTestSshConfig(`# Created by AWS Toolkit
Host sm_*
    User '%r'
`)

            sandbox.stub(config, 'promptToUpdateSshConfig').resolves(true)
            sandbox.stub(config, 'removeSshConfigSection').rejects(new Error('Write failed'))

            // User clicks "Open SSH Config"
            getTestWindow().onDidShowMessage((message) => {
                if (message.items.some((item) => item.title === 'Open SSH Config')) {
                    message.selectItem('Open SSH Config')
                }
            })

            const result = await config.verifySSHHost(testProxyCommand)

            assert.ok(result.isErr())
            const error = result.err()
            assert.ok(error instanceof ToolkitError)
            assert.strictEqual(error.code, 'SshConfigOpenedForEdit')
            assert.ok(error.message.includes('Fix the issue and try connecting again'))
        })
    })
})
