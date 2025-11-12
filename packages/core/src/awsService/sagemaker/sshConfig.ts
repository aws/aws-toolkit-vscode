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

const localize = nls.loadMessageBundle()

/**
 * SageMaker-specific SSH configuration that handles outdated config detection and updates.
 * Extends the base SshConfig with SageMaker-specific validation logic.
 */
export class SageMakerSshConfig extends SshConfig {
    public override async verifySSHHost(proxyCommand: string) {
        const configStateResult = await this.readSshConfigState(proxyCommand)

        // If reading config state failed, return the error
        if (configStateResult.isErr()) {
            return configStateResult
        }

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
                    // Update state to reflect that section now exists and is up to date
                    configState.hasSshSection = true
                    configState.isOutdated = false
                } catch (e) {
                    // Failed to update, prompt user to fix manually
                    try {
                        await this.promptToFixUpdateFailure(e instanceof Error ? e : undefined)
                        const configOpenedError = new ToolkitError(
                            `SSH configuration file opened for editing. Fix the issue and try connecting again.`,
                            {
                                code: 'SshConfigOpenedForEdit',
                                details: { configPath: getSshConfigPath() },
                            }
                        )
                        return Result.err(configOpenedError)
                    } catch (promptError) {
                        // User cancelled opening the file
                        if (promptError instanceof CancellationError) {
                            return Result.err(
                                ToolkitError.chain(
                                    e,
                                    `Failed to update SSH config section. Fix your ~/.ssh/config file manually or remove the outdated ${this.configHostName} section.`,
                                    {
                                        code: 'SshConfigUpdateFailed',
                                        details: {
                                            configHostName: this.configHostName,
                                            configPath: getSshConfigPath(),
                                        },
                                    }
                                )
                            )
                        }
                        return Result.err(
                            ToolkitError.chain(
                                promptError,
                                'Unexpected error while handling SSH config update failure',
                                {
                                    code: 'SshConfigErrorHandlingFailed',
                                }
                            )
                        )
                    }
                }
            } else {
                // User declined
                const userCancelledError = new ToolkitError(
                    `SSH configuration has an outdated ${this.configHostName} section. Allow the toolkit to update it or fix your ~/.ssh/config file manually.`,
                    {
                        code: 'SshConfigUpdateDeclined',
                        details: { configHostName: this.configHostName },
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
                    const configOpenedError = new ToolkitError(
                        `SSH configuration file opened for editing. Fix the syntax errors and try connecting again.`,
                        {
                            code: 'SshConfigOpenedForEdit',
                            details: { configPath: getSshConfigPath() },
                        }
                    )
                    return Result.err(configOpenedError)
                } catch (e) {
                    // User cancelled
                    if (e instanceof CancellationError) {
                        const externalConfigError = new ToolkitError(
                            `SSH configuration has syntax errors in your ~/.ssh/config file. Fix the configuration manually to enable remote connection.`,
                            {
                                code: 'SshConfigExternalError',
                                details: { configPath: getSshConfigPath() },
                            }
                        )
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
     * Reads SSH config file and determines its state.
     */
    public async readSshConfigState(proxyCommand: string): Promise<
        Result<
            {
                hasSshSection: boolean
                isOutdated: boolean
                existingSection?: string
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

        const confirmTitle = localize(
            'AWS.sshConfig.confirm.updateSshConfig.title',
            '{0} Toolkit will update the {1} section in ~/.ssh/config',
            getIdeProperties().company,
            this.configHostName
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
            'Failed to update your ~/.ssh/config file automatically.{0}\n\nOpen the file to fix the issue manually.',
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
            'There is an error in your ~/.ssh/config file.{0}\n\nFix the error and try again.',
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
            throw ToolkitError.chain(e, `Failed to remove SSH config section for ${this.configHostName}`, {
                code: 'SshConfigRemovalFailed',
            })
        }
    }
}
