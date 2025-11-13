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
import { SshConfigOpenedForEditMessage } from '../../../awsService/sagemaker/constants'

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
         * Test: SSH config has sm_* section with correct/updated format
         * Expected: Returns Ok with hasSshSection=true, isOutdated=false
         */
        it('returns Ok with outdated=false when section is current', async function () {
            await writeTestSshConfig(`
# Created by AWS Toolkit for VSCode. https://github.com/aws/aws-toolkit-vscode
Host sm_*
    ForwardAgent yes
    AddKeysToAgent yes
    StrictHostKeyChecking accept-new
    ProxyCommand 'sagemaker_connect' '%n'`)

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
            const configContent = `
# Created by AWS Toolkit for VSCode. https://github.com/aws/aws-toolkit-vscode
Host sm_*
    ForwardAgent yes
    AddKeysToAgent yes
    StrictHostKeyChecking accept-new
    ProxyCommand 'sagemaker_connect' '%n'`
            await fs.writeFile(sshConfigPath, configContent, { flag: 'w' })

            const result = await config.readSshConfigState(testProxyCommand)

            assert.ok(result.isOk())
            const state = result.ok()
            assert.strictEqual(state.hasSshSection, true)
            assert.strictEqual(state.isOutdated, false)
        })

        /**
         * Test: SSH config has sm_* section but doesn't match any known version
         * Expected: Detects as outdated with foundVersion='unknown'
         */
        it('detects user-modified config as outdated', async function () {
            await writeTestSshConfig(`# Created by AWS Toolkit
Host sm_*
    ProxyCommand 'sagemaker_connect' '%n'
    ForwardAgent yes
    ServerAliveInterval 60
`)

            const result = await config.readSshConfigState(testProxyCommand)

            assert.ok(result.isOk())
            const state = result.ok()
            assert.strictEqual(state.hasSshSection, true)
            assert.strictEqual(state.isOutdated, true)
            assert.strictEqual(state.foundVersion, 'unknown')
        })

        /**
         * Test: Identifies v1 format correctly
         * Expected: Returns foundVersion='v1', isOutdated=true
         */
        it('identifies v1 format with User directive', async function () {
            await writeTestSshConfig(`
# Created by AWS Toolkit for VSCode. https://github.com/aws/aws-toolkit-vscode
Host sm_*
    ForwardAgent yes
    AddKeysToAgent yes
    StrictHostKeyChecking accept-new
    ProxyCommand 'sagemaker_connect' '%n'
    User '%r'`)

            const result = await config.readSshConfigState(testProxyCommand)

            assert.ok(result.isOk())
            const state = result.ok()
            assert.strictEqual(state.hasSshSection, true)
            assert.strictEqual(state.isOutdated, true)
            assert.strictEqual(state.foundVersion, 'v1')
        })

        /**
         * Test: Identifies v2 format correctly
         * Expected: Returns foundVersion='v2', isOutdated=false
         */
        it('identifies v2 format as current', async function () {
            await writeTestSshConfig(`
# Created by AWS Toolkit for VSCode. https://github.com/aws/aws-toolkit-vscode
Host sm_*
    ForwardAgent yes
    AddKeysToAgent yes
    StrictHostKeyChecking accept-new
    ProxyCommand 'sagemaker_connect' '%n'`)

            const result = await config.readSshConfigState(testProxyCommand)

            assert.ok(result.isOk())
            const state = result.ok()
            assert.strictEqual(state.hasSshSection, true)
            assert.strictEqual(state.isOutdated, false)
            assert.strictEqual(state.foundVersion, 'v2')
        })
    })

    describe('verifySSHHost', function () {
        let removeStub: sinon.SinonStub
        let writeStub: sinon.SinonStub
        let matchStub: sinon.SinonStub

        beforeEach(function () {
            removeStub = sandbox.stub(config, 'removeSshConfigSection')
            writeStub = sandbox.stub(config as any, 'writeSectionToConfig')
            matchStub = sandbox.stub(config as any, 'matchSshSection')
        })

        /**
         * Test: checks for outdated config BEFORE SSH validation
         * Expected: Section is updated before validation runs
         */
        it('checks for outdated config BEFORE running SSH validation', async function () {
            await writeTestSshConfig(`
# Created by AWS Toolkit for VSCode. https://github.com/aws/aws-toolkit-vscode
Host sm_*
    ForwardAgent yes
    AddKeysToAgent yes
    StrictHostKeyChecking accept-new
    ProxyCommand 'sagemaker_connect' '%n'
    User '%r'`)

            getTestWindow().onDidShowMessage((message) => {
                if (message.items.some((item) => item.title === 'Update SSH config')) {
                    message.selectItem('Update SSH config')
                }
            })
            removeStub.resolves()
            writeStub.resolves()
            matchStub.resolves(Result.ok(`Host sm_*\n    ProxyCommand ${testProxyCommand}`))

            await config.verifySSHHost(testProxyCommand)

            assert(removeStub.calledBefore(matchStub), 'Section should be updated before validation runs')
        })

        /**
         * Test: User accepts the update prompt for outdated config
         * Expected: Removes old section, writes new section, returns Ok
         */
        it('prompts user to update when config is outdated', async function () {
            await writeTestSshConfig(`
# Created by AWS Toolkit for VSCode. https://github.com/aws/aws-toolkit-vscode
Host sm_*
    ForwardAgent yes
    AddKeysToAgent yes
    StrictHostKeyChecking accept-new
    ProxyCommand 'sagemaker_connect' '%n'
    User '%r'`)

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
            await writeTestSshConfig(`# Created by AWS Toolkit for VSCode. https://github.com/aws/aws-toolkit-vscode
Host sm_*
    ForwardAgent yes
    AddKeysToAdmin yes
    StrictHostKeyChecking accept-new
    ProxyCommand 'sagemaker_connect' '%n'
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
            assert(removeStub.notCalled, 'Should not remove section when user declines')
            assert(writeStub.notCalled, 'Should not write section when user declines')
        })

        /**
         * Test: SSH validation fails due to error elsewhere in config (not in sm_* section)
         * Expected: Extracts line number from error, prompts user to fix external error
         */
        it('shows helpful error with line number when external error exists', async function () {
            await writeTestSshConfig(`
# Created by AWS Toolkit for VSCode. https://github.com/aws/aws-toolkit-vscode
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
            await writeTestSshConfig(`
# Created by AWS Toolkit for VSCode. https://github.com/aws/aws-toolkit-vscode
Host sm_*
    ForwardAgent yes
    AddKeysToAgent yes
    StrictHostKeyChecking accept-new
    ProxyCommand 'sagemaker_connect' '%n'`)

            matchStub.resolves(Result.ok("Host sm_*\n    ProxyCommand 'sagemaker_connect' '%n'"))

            const result = await config.verifySSHHost(testProxyCommand)

            assert.ok(result.isOk())
            assert(removeStub.notCalled, 'Should not update when config is up-to-date')
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
# Created by AWS Toolkit for VSCode. https://github.com/aws/aws-toolkit-vscode
Host sm_*
    ForwardAgent yes
    AddKeysToAgent yes
    StrictHostKeyChecking accept-new
    ProxyCommand 'sagemaker_connect' '%n'
    User '%r'
Host another.com
    User test
`)

            await config.removeSshConfigSection(testProxyCommand)

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

            await config.removeSshConfigSection(testProxyCommand)

            const content = await fs.readFileText(sshConfigPath)
            assert.ok(content.includes('Host github.com'), 'Should keep existing content')
        })

        /**
         * Test: Removes section from file without trailing newline (EOF edge case)
         * Expected: Section removed correctly even without trailing newline
         */
        it('handles files without trailing newline', async function () {
            const configContent = `# Created by AWS Toolkit for VSCode. https://github.com/aws/aws-toolkit-vscode
Host sm_*
    ForwardAgent yes
    AddKeysToAgent yes
    StrictHostKeyChecking accept-new
    ProxyCommand 'sagemaker_connect' '%n'
    User '%r'`
            await fs.writeFile(sshConfigPath, configContent.trimEnd(), { flag: 'w' })

            await config.removeSshConfigSection(testProxyCommand)

            const content = await fs.readFileText(sshConfigPath)
            assert.strictEqual(content.trim(), '', 'Should remove section even without trailing newline')
        })

        /**
         * Test: Versioned matching - removes old v1 format (with User '%r')
         * Expected: Old format section is recognized and removed
         */
        it('removes old v1 format with User directive', async function () {
            await writeTestSshConfig(`
# Created by AWS Toolkit for VSCode. https://github.com/aws/aws-toolkit-vscode
Host sm_*
    ForwardAgent yes
    AddKeysToAgent yes
    StrictHostKeyChecking accept-new
    ProxyCommand 'sagemaker_connect' '%n'
    User '%r'
Host github.com
    User git
`)

            await config.removeSshConfigSection(testProxyCommand)

            const content = await fs.readFileText(sshConfigPath)
            assert.ok(!content.includes('Host sm_*'), 'Should remove old v1 section')
            assert.ok(!content.includes("User '%r'"), 'Should remove User directive')
            assert.ok(content.includes('Host github.com'), 'Should keep other sections')
        })

        /**
         * Test: Removes v2 format (current version)
         * Expected: v2 section is recognized and removed
         */
        it('removes v2 format without User directive', async function () {
            await writeTestSshConfig(`
# Created by AWS Toolkit for VSCode. https://github.com/aws/aws-toolkit-vscode
Host sm_*
    ForwardAgent yes
    AddKeysToAgent yes
    StrictHostKeyChecking accept-new
    ProxyCommand 'sagemaker_connect' '%n'
Host github.com
    User git
`)

            await config.removeSshConfigSection(testProxyCommand)

            const content = await fs.readFileText(sshConfigPath)
            assert.ok(!content.includes('Host sm_*'), 'Should remove v2 section')
            assert.ok(content.includes('Host github.com'), 'Should keep other sections')
        })

        /**
         * Test: Versioned matching - does NOT remove user-modified section
         * Expected: Throws error, section is not removed
         */
        it('throws error for user-modified section', async function () {
            await writeTestSshConfig(`# Created by AWS Toolkit for VSCode. https://github.com/aws/aws-toolkit-vscode
Host sm_*
    ForwardAgent yes
    ServerAliveInterval 60
    ProxyCommand 'sagemaker_connect' '%n'
    
Host github.com
    User git
`)

            await assert.rejects(
                async () => await config.removeSshConfigSection(testProxyCommand),
                (error: Error) => {
                    assert.ok(error instanceof ToolkitError)
                    // Error is wrapped in SshConfigRemovalFailed, check the cause
                    const toolkitError = error as ToolkitError
                    assert.strictEqual(toolkitError.code, 'SshConfigRemovalFailed')
                    assert.ok(toolkitError.cause instanceof ToolkitError)
                    assert.strictEqual((toolkitError.cause as ToolkitError).code, 'SshConfigModified')
                    return true
                },
                'Should throw SshConfigRemovalFailed with SshConfigModified cause'
            )

            // Verify section was NOT removed
            const content = await fs.readFileText(sshConfigPath)
            assert.ok(content.includes('Host sm_*'), 'Should NOT remove modified section')
            assert.ok(content.includes('ServerAliveInterval 60'), 'User customization should remain')
        })
    })

    describe('promptOtherSshConfigError', function () {
        /**
         * Test: SSH error message contains line number (e.g., "line 42")
         * Expected: Extracts line number and includes it in error message (but doesn't navigate cursor)
         */
        it('extracts and displays line number from SSH error', async function () {
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

            // removal failure during update
            sandbox.stub(config, 'removeSshConfigSection').rejects(new Error('Write failed'))

            // User accepts update prompt (handled by updateOutdatedSection internally)
            getTestWindow().onDidShowMessage((message) => {
                if (message.items.some((item) => item.title === 'Update SSH config')) {
                    message.selectItem('Update SSH config')
                }
                // User cancels the "Open SSH Config" prompt after failure
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
            await writeTestSshConfig(`# Created by AWS Toolkit for VSCode. https://github.com/aws/aws-toolkit-vscode
Host sm_*
    ForwardAgent yes
    AddKeysToAgent yes
    StrictHostKeyChecking accept-new
    ProxyCommand 'sagemaker_connect' '%n'
    User '%r'
    `)

            // Simulate removal failure during update
            sandbox.stub(config, 'removeSshConfigSection').rejects(new Error('Write failed'))

            // User accepts update prompt, then clicks "Open SSH Config" after failure
            getTestWindow().onDidShowMessage((message) => {
                if (message.items.some((item) => item.title === 'Update SSH config')) {
                    message.selectItem('Update SSH config')
                }
                if (message.items.some((item) => item.title === 'Open SSH Config')) {
                    message.selectItem('Open SSH Config')
                }
            })

            const result = await config.verifySSHHost(testProxyCommand)

            assert.ok(result.isErr())
            const error = result.err()
            assert.ok(error instanceof ToolkitError)
            assert.strictEqual(error.code, 'SshConfigOpenedForEdit')
            assert.strictEqual(error.message, SshConfigOpenedForEditMessage())
        })
    })

    describe('createSSHConfigSection', function () {
        /**
         * Test: SageMaker SSH config format
         * Expected: Contains SageMaker-specific directives (ForwardAgent, AddKeysToAgent, StrictHostKeyChecking)
         *           Does NOT contain User '%r'
         */
        it('creates SageMaker-specific SSH config section', function () {
            // Access the protected method through type casting
            const section = (config as any).createSSHConfigSection(testProxyCommand)

            // Verify SageMaker-specific directives
            assert.ok(section.includes('Host sm_'), 'Should include Host sm_*')
            assert.ok(section.includes('ForwardAgent yes'), 'Should include ForwardAgent yes')
            assert.ok(section.includes('AddKeysToAgent yes'), 'Should include AddKeysToAgent yes')
            assert.ok(section.includes('StrictHostKeyChecking accept-new'), 'Should include StrictHostKeyChecking')
            assert.ok(section.includes(`ProxyCommand ${testProxyCommand}`), 'Should include ProxyCommand')

            // Verify it does NOT include CodeCatalyst-specific directives
            assert.ok(!section.includes("User '%r'"), 'Should NOT include User directive (SageMaker-specific)')
            assert.ok(!section.includes('IdentityFile'), 'Should NOT include IdentityFile (SageMaker-specific)')
        })

        /**
         * Test: SSH config includes AWS Toolkit comment
         * Expected: Section starts with AWS Toolkit comment for identification
         */
        it('includes AWS Toolkit comment in config section', function () {
            const section = (config as any).createSSHConfigSection(testProxyCommand)

            assert.ok(
                section.includes('# Created by AWS Toolkit'),
                'Should include AWS Toolkit comment for identification'
            )
        })
    })
})
