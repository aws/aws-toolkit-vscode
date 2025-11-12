/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { SshConfig } from '../../shared/sshConfig'
import { Result } from '../../shared/utilities/result'
import { ToolkitError } from '../../shared/errors'
import { getLogger } from '../../shared/logger/logger'
import { getIdeProperties } from '../../shared/extensionUtilities'
import { showConfirmationMessage } from '../../shared/utilities/messages'
import { CancellationError } from '../../shared/utilities/timeoutUtils'
import { getSshConfigPath } from '../../shared/extensions/ssh'
import { fileExists, readFileAsString } from '../../shared/filesystemUtilities'
import fs from '../../shared/fs/fs'
import {
    SshConfigUpdateDeclinedMessage,
    SshConfigOpenedForEditMessage,
    SshConfigSyntaxErrorMessage,
    SshConfigRemovalFailedMessage,
    SshConfigUpdateFailedMessage,
} from './constants'

const localize = nls.loadMessageBundle()

/**
 * SageMaker-specific SSH configuration that handles outdated config detection and updates.
 * Extends the base SshConfig with SageMaker-specific validation logic.
 */
export class SageMakerSshConfig extends SshConfig {
    public override async verifySSHHost(proxyCommand: string) {
        // Read the current state of SSH config
        const configStateResult = await this.readSshConfigState(proxyCommand)

        // If reading config state failed, return the error result
        if (configStateResult.isErr()) {
            return configStateResult
        }

        // Extract the state if section exists and if it's outdated
        const configState = configStateResult.ok()

        // Check if section exists and is outdated
        if (configState.hasSshSection && configState.isOutdated) {
            // Section is outdated ask user to update it before validation
            const shouldUpdate = await this.promptToUpdateSshConfig()

            if (shouldUpdate) {
                try {
                    // Remove the outdated section
                    await this.removeSshConfigSection()
                    // Write the new section
                    await this.writeSectionToConfig(proxyCommand)
                    getLogger().info('SSH config: Successfully updated sm_* section')

                    // Update state snapshot to reflect the changes
                    configState.hasSshSection = true
                    configState.isOutdated = false
                } catch (e) {
                    // Failed to update, handle the failure
                    return await this.handleSshConfigUpdateFailure(e)
                }
            } else {
                // User declined the auto-update
                const configPath = getSshConfigPath()
                const userCancelledError = new ToolkitError(
                    SshConfigUpdateDeclinedMessage(this.configHostName, configPath),
                    {
                        code: 'SshConfigUpdateDeclined',
                        details: { configHostName: this.configHostName, configPath },
                    }
                )
                return Result.err(userCancelledError)
            }
        }

        // Run validation
        const matchResult = await this.matchSshSection()
        if (matchResult.isErr()) {
            const sshError = matchResult.err()

            if (configState.hasSshSection) {
                // SM exists and is up-to-date but validation still failed means the error is elsewhere in the SSH config
                try {
                    await this.promptOtherSshConfigError(sshError)
                    const configOpenedError = new ToolkitError(SshConfigOpenedForEditMessage(), {
                        code: 'SshConfigOpenedForEdit',
                        details: { configPath: getSshConfigPath() },
                    })
                    return Result.err(configOpenedError)
                } catch (e) {
                    // User cancelled the "Open SSH Config" prompt (from promptOtherSshConfigError)
                    if (e instanceof CancellationError) {
                        const configPath = getSshConfigPath()
                        const externalConfigError = new ToolkitError(SshConfigSyntaxErrorMessage(configPath), {
                            code: 'SshConfigExternalError',
                            details: { configPath },
                        })
                        return Result.err(externalConfigError)
                    }
                    return Result.err(
                        ToolkitError.chain(e, 'Unexpected error while handling SSH config error', {
                            code: 'SshConfigErrorHandlingFailed',
                        })
                    )
                }
            }
            return matchResult
        }

        const configSection = matchResult.ok()
        const hasProxyCommand = configSection?.includes(proxyCommand)

        if (!hasProxyCommand) {
            try {
                await this.promptUserToConfigureSshConfig(configSection, proxyCommand)
            } catch (e) {
                return Result.err(
                    ToolkitError.chain(e, 'Failed to configure SSH config', {
                        code: 'SshConfigPromptFailed',
                    })
                )
            }
        }

        return Result.ok()
    }

    /**
     * Reads SSH config file once and determines its current state.
     *
     * State represents the current condition of the SSH config:
     * - hasSshSection: Does the sm_* section exist in the file?
     * - isOutdated: Is the section in an old/incorrect format?
     * - existingSection: The actual content of the section (if it exists)
     *
     * @returns Result containing the state object or an error if file read fails
     */
    public async readSshConfigState(proxyCommand: string): Promise<
        Result<
            {
                hasSshSection: boolean // True if sm_* section exists
                isOutdated: boolean // True if section needs updating
                existingSection?: string // Current section content (optional)
            },
            ToolkitError
        >
    > {
        const sshConfigPath = getSshConfigPath()

        // File not existing
        if (!(await fileExists(sshConfigPath))) {
            return Result.ok({ hasSshSection: false, isOutdated: false })
        }

        try {
            const configContent = await readFileAsString(sshConfigPath)
            const escapedPrefix = this.hostNamePrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

            // Check if section exists
            const sectionPattern = new RegExp(`# Created by AWS Toolkit[^\\n]*\\n` + `Host\\s+${escapedPrefix}`, 'm')

            const hasSshSection = sectionPattern.test(configContent)

            if (!hasSshSection) {
                return Result.ok({ hasSshSection: false, isOutdated: false })
            }

            // Extract existing section
            const extractPattern = new RegExp(
                `# Created by AWS Toolkit[^\\n]*\\n` +
                    `(Host\\s+${escapedPrefix}[^\\n]*(?:\\n|$)` +
                    `(?:(?!Host\\s)[^\\n]*(?:\\n|$))*)`,
                'gm'
            )

            const match = extractPattern.exec(configContent)
            const existingSection = match?.[1]?.trim()
            if (!existingSection) {
                return Result.ok({ hasSshSection: true, isOutdated: false })
            }

            // Check if outdated
            const expectedSection = this.createSSHConfigSection(proxyCommand).trim()
            const expectedWithoutComment = expectedSection
                .split('\n')
                .filter((line) => !line.includes('# Created by AWS Toolkit'))
                .join('\n')
                .trim()

            const normalizeWhitespace = (str: string) => str.replace(/\s+/g, ' ').trim()
            const isOutdated = normalizeWhitespace(existingSection) !== normalizeWhitespace(expectedWithoutComment)

            return Result.ok({ hasSshSection: true, isOutdated, existingSection })
        } catch (e) {
            return Result.err(
                ToolkitError.chain(e, 'Failed to read SSH config file', {
                    code: 'SshConfigReadFailed',
                    details: { configPath: sshConfigPath },
                })
            )
        }
    }

    /**
     * Prompts user to update the outdated SSH config section.
     * This is shown when the host section exists but is outdated.
     */
    public async promptToUpdateSshConfig(): Promise<boolean> {
        getLogger().warn(`SSH config section is outdated for ${this.configHostName}`)

        const configPath = getSshConfigPath()
        const confirmTitle = localize(
            'AWS.sshConfig.confirm.updateSshConfig.title',
            '{0} Toolkit will update the {1} section in {2}',
            getIdeProperties().company,
            this.configHostName,
            configPath
        )
        const confirmText = localize('AWS.sshConfig.confirm.updateSshConfig.button', 'Update SSH config')

        const response = await showConfirmationMessage({ prompt: confirmTitle, confirm: confirmText })

        return response === true
    }

    /**
     * Prompts user when automatic SSH config update fails.
     * @throws CancellationError if user cancels
     */
    public async promptToFixUpdateFailure(updateError?: Error): Promise<void> {
        const sshConfigPath = getSshConfigPath()

        // Include error details if available
        let errorDetails = ''
        if (updateError?.message) {
            errorDetails = `\n\nError: ${updateError.message}`
        }

        const message = localize(
            'AWS.sshConfig.error.updateFailed',
            'Failed to update your {0} file automatically.{1}\n\nOpen the file to fix the issue manually.',
            sshConfigPath,
            errorDetails
        )

        const openButton = localize('AWS.ssh.openConfig', 'Open SSH Config')
        const cancelButton = localize('AWS.generic.cancel', 'Cancel')

        const response = await vscode.window.showErrorMessage(message, openButton, cancelButton)

        if (response === openButton) {
            await vscode.window.showTextDocument(vscode.Uri.file(sshConfigPath))
            return
        }
        // User cancelled or closed dialog, throw cancellation error
        throw new CancellationError('user')
    }

    /**
     * Prompts user when SSH config has errors elsewhere (not in toolkit's section).
     * @throws CancellationError if user cancels
     */
    public async promptOtherSshConfigError(sshError?: Error): Promise<void> {
        const sshConfigPath = getSshConfigPath()

        // extract line number from SSH error message
        let errorDetails = ''
        if (sshError?.message) {
            const lineMatch = sshError.message.match(/line (\d+)/i)
            if (lineMatch) {
                errorDetails = `\n\nError at line ${lineMatch[1]}`
            }
        }

        const message = localize(
            'AWS.sshConfig.error.otherError',
            'There is an error in your {0} file.{1}\n\nFix the error and try again.',
            sshConfigPath,
            errorDetails
        )

        const openButton = localize('AWS.ssh.openConfig', 'Open SSH Config')
        const cancelButton = localize('AWS.generic.cancel', 'Cancel')

        const response = await vscode.window.showErrorMessage(message, openButton, cancelButton)

        if (response === openButton) {
            const doc = await vscode.window.showTextDocument(vscode.Uri.file(sshConfigPath))

            if (sshError?.message) {
                const lineMatch = sshError.message.match(/line (\d+)/i)
                if (lineMatch) {
                    const lineNumber = parseInt(lineMatch[1], 10) - 1
                    const position = new vscode.Position(lineNumber, 0)
                    doc.selection = new vscode.Selection(position, position)
                    doc.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter)
                }
            }

            // user chose to open config to fix it
            return
        }
        // User cancelled or closed dialog, throw cancellation error
        throw new CancellationError('user')
    }

    /**
     * Removes the toolkit-managed SSH config section.
     */
    public async removeSshConfigSection(): Promise<void> {
        const sshConfigPath = getSshConfigPath()

        if (!(await fileExists(sshConfigPath))) {
            getLogger().info('SSH config file does not exist, nothing to remove')
            return
        }

        try {
            const configContent = await readFileAsString(sshConfigPath)
            const escapedPrefix = this.hostNamePrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            const sectionPattern = new RegExp(
                `# Created by AWS Toolkit[^\\n]*\\n` +
                    `Host\\s+${escapedPrefix}[^\\n]*(?:\\n|$)` +
                    `(?:(?!Host\\s)[^\\n]*(?:\\n|$))*`,
                'gm'
            )

            const updatedContent = configContent.replace(sectionPattern, '')

            if (updatedContent === configContent) {
                getLogger().warn(`SSH config: No ${this.configHostName} section found to remove`)
                return
            }

            await fs.writeFile(sshConfigPath, updatedContent, { atomic: true })

            getLogger().info(`SSH config: Removed ${this.configHostName} section`)
        } catch (e) {
            throw ToolkitError.chain(e, SshConfigRemovalFailedMessage(this.configHostName), {
                code: 'SshConfigRemovalFailed',
            })
        }
    }

    /**
     * Handles SSH config update failure by prompting user to fix manually.
     */
    private async handleSshConfigUpdateFailure(updateError: unknown): Promise<Result<void, ToolkitError>> {
        try {
            // Prompt user to open SSH config file to fix manually
            await this.promptToFixUpdateFailure(updateError instanceof Error ? updateError : undefined)

            // User opened the file
            const configOpenedError = new ToolkitError(SshConfigOpenedForEditMessage(), {
                code: 'SshConfigOpenedForEdit',
                details: { configPath: getSshConfigPath() },
            })
            return Result.err(configOpenedError)
        } catch (promptError) {
            // User cancelled the "Open SSH Config" prompt (from promptToFixUpdateFailure)
            if (promptError instanceof CancellationError) {
                const configPath = getSshConfigPath()
                return Result.err(
                    ToolkitError.chain(updateError, SshConfigUpdateFailedMessage(configPath, this.configHostName), {
                        code: 'SshConfigUpdateFailed',
                        details: {
                            configHostName: this.configHostName,
                            configPath,
                        },
                    })
                )
            }

            // Unexpected error during prompt
            return Result.err(
                ToolkitError.chain(promptError, 'Unexpected error while handling SSH config update failure', {
                    code: 'SshConfigErrorHandlingFailed',
                })
            )
        }
    }

    /**
     * Creates SageMaker-specific SSH config section.
     */
    protected override createSSHConfigSection(proxyCommand: string): string {
        return `
# Created by AWS Toolkit for VSCode. https://github.com/aws/aws-toolkit-vscode
Host ${this.configHostName}
    ForwardAgent yes
    AddKeysToAgent yes
    StrictHostKeyChecking accept-new
    ProxyCommand ${proxyCommand}
    `
    }
}
