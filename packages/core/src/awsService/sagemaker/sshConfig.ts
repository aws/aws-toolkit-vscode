/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
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
    SshConfigModifiedMessage,
} from './constants'

const logger = getLogger('sagemaker')

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
            const updateResult = await this.updateOutdatedSection(proxyCommand)
            if (updateResult.isErr()) {
                return updateResult
            }
        }

        // Run validation
        const matchResult = await this.matchSshSection()
        if (matchResult.isErr()) {
            const sshError = matchResult.err()

            // Check if SM section either existed before or just created)
            const hasSshSection = configState.hasSshSection || !configState.isOutdated

            if (hasSshSection) {
                // Section exists and should be up-to-date, but validation still failed
                // This means the error is elsewhere in the SSH config
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

            // Extract the toolkit section
            const existingSection = this.extractToolkitSection(configContent)

            if (!existingSection) {
                return Result.ok({ hasSshSection: false, isOutdated: false })
            }

            // Generate the expected current version
            const expectedSection = this.createSSHConfigSection(proxyCommand).trim()

            // Compare existing vs expected to check if outdated
            const normalizeWhitespace = (str: string) => str.replace(/\s+/g, ' ').trim()
            const isOutdated = normalizeWhitespace(existingSection) !== normalizeWhitespace(expectedSection)

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
     * Handles updating an outdated SSH config section.
     * Prompts user, removes old section, writes new section.
     *
     * @returns Result.ok() if updated successfully, Result.err() if user declined or update failed
     */
    private async updateOutdatedSection(proxyCommand: string): Promise<Result<void, ToolkitError>> {
        const shouldUpdate = await this.promptToUpdateSshConfig()

        if (!shouldUpdate) {
            // User declined the auto-update
            const configPath = getSshConfigPath()
            return Result.err(
                new ToolkitError(SshConfigUpdateDeclinedMessage(this.configHostName, configPath), {
                    code: 'SshConfigUpdateDeclined',
                    details: { configHostName: this.configHostName, configPath },
                })
            )
        }

        try {
            // Remove the outdated section
            await this.removeSshConfigSection()
            // Write the new section
            await this.writeSectionToConfig(proxyCommand)
            logger.info('Successfully updated sm_* section')
            return Result.ok()
        } catch (e) {
            // Failed to update, handle the failure
            return await this.handleSshConfigUpdateFailure(e)
        }
    }

    /**
     * Prompts user to update the outdated SSH config section.
     * This is shown when the host section exists but is outdated.
     */
    private async promptToUpdateSshConfig(): Promise<boolean> {
        logger.warn(`Section is outdated for ${this.configHostName}`)

        const configPath = getSshConfigPath()
        const confirmTitle = `${getIdeProperties().company} Toolkit will update the ${this.configHostName} section in ${configPath}`
        const confirmText = 'Update SSH config'

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

        const message = `Failed to update your ${sshConfigPath} file automatically.${errorDetails}\n\nOpen the file to fix the issue manually.`

        const openButton = 'Open SSH Config'
        const cancelButton = 'Cancel'

        const response = await vscode.window.showErrorMessage(message, openButton, cancelButton)

        // User clicked Cancel or closed the dialog
        if (response !== openButton) {
            throw new CancellationError('user')
        }

        await vscode.window.showTextDocument(vscode.Uri.file(sshConfigPath))
    }

    /**
     * Prompts user when SSH config has errors elsewhere (not in toolkit's section).
     * @throws CancellationError if user cancels
     */
    public async promptOtherSshConfigError(sshError?: Error): Promise<void> {
        const sshConfigPath = getSshConfigPath()

        // Extract line number from SSH error message (best-effort).
        // Note: SSH error formats are not standardized and may vary across implementations.
        let errorDetails = ''
        if (sshError?.message) {
            const lineMatch = sshError.message.match(/line (\d+)/i)
            if (lineMatch) {
                errorDetails = `\n\nError at line ${lineMatch[1]}`
            }
        }

        const message = `There is an error in your ${sshConfigPath} file.${errorDetails}\n\nFix the error and try again.`

        const openButton = 'Open SSH Config'
        const cancelButton = 'Cancel'

        const response = await vscode.window.showErrorMessage(message, openButton, cancelButton)

        // User clicked Cancel or closed the dialog
        if (response !== openButton) {
            throw new CancellationError('user')
        }

        await vscode.window.showTextDocument(vscode.Uri.file(sshConfigPath))
    }

    /**
     * Extracts the toolkit-managed SSH config section from the config content.
     * returns Object with fullSection((comment + Host + directives)) and hostSection(Host + directives), or null if not found
     */
    private extractToolkitSection(configContent: string): string | undefined {
        const lines = configContent.split('\n')
        let startIndex = -1
        let endIndex = -1

        // Find the toolkit comment marker
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('# Created by AWS Toolkit')) {
                startIndex = i
                break
            }
        }

        if (startIndex === -1) {
            return undefined
        }

        // Check if next line is our Host directive
        if (startIndex + 1 >= lines.length) {
            return undefined
        }

        const hostLine = lines[startIndex + 1]
        if (!hostLine.trim().startsWith(`Host ${this.configHostName}`)) {
            return undefined
        }

        // Extract all indented lines (directives) after the Host line
        // Stop at: blank line, non-indented line, or another Host directive
        endIndex = startIndex + 2 // Start after Host line

        for (let i = startIndex + 2; i < lines.length; i++) {
            const line = lines[i]
            const trimmed = line.trim()

            // Stop at blank line
            if (trimmed === '') {
                endIndex = i
                break
            }

            // Stop at another Host directive
            if (trimmed.startsWith('Host ')) {
                endIndex = i
                break
            }

            // Stop at non-indented line (comment or another section)
            if (line.length > 0 && line[0] !== ' ' && line[0] !== '\t') {
                endIndex = i
                break
            }

            endIndex = i + 1
        }

        // Extract the full section (comment + Host + directives)
        return lines.slice(startIndex, endIndex).join('\n')
    }

    /**
     * Removes the toolkit-managed SSH config section using version matching.
     *
     * This method checks for exact matches against known toolkit-generated configs
     * to ensure we only remove content we created, not user-defined content.
     */
    public async removeSshConfigSection(): Promise<void> {
        const sshConfigPath = getSshConfigPath()

        if (!(await fileExists(sshConfigPath))) {
            logger.info('Config file does not exist, nothing to remove')
            return
        }

        try {
            const configContent = await readFileAsString(sshConfigPath)
            const extractedSection = this.extractToolkitSection(configContent)

            if (!extractedSection) {
                logger.warn(`No ${this.configHostName} section found to remove`)
                return
            }

            // Get the proxy command from the extracted section
            const proxyCommandMatch = extractedSection.match(/ProxyCommand\s+(.+)/)
            if (!proxyCommandMatch) {
                logger.warn('Could not extract ProxyCommand from section, skipping removal')
                return
            }
            const proxyCommand = proxyCommandMatch[1].trim()

            // Check against known versions
            const knownVersions = [
                this.createSSHConfigSection(proxyCommand).trim(), // Current version
                this.createSSHConfigV1(proxyCommand).trim(), // Old version with User '%r'
            ]

            const normalizeWhitespace = (str: string) => str.replace(/\s+/g, ' ').trim()
            const extractedNormalized = normalizeWhitespace(extractedSection)

            let matchedVersion: string | undefined
            for (const knownVersion of knownVersions) {
                if (normalizeWhitespace(knownVersion) === extractedNormalized) {
                    matchedVersion = extractedSection
                    break
                }
            }

            if (!matchedVersion) {
                // Section doesn't match any known version - likely user-modified
                // Throw error so handleSshConfigUpdateFailure() prompts user to fix manually
                throw new ToolkitError(SshConfigModifiedMessage(this.configHostName), {
                    code: 'SshConfigModified',
                })
            }

            const updatedContent = configContent.replace(matchedVersion, '')

            await fs.writeFile(sshConfigPath, updatedContent, { atomic: true })

            logger.info(`Removed ${this.configHostName} section`)
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
     * Generates old version 1 SSH config (with User '%r' directive).
     * This was the format used in earlier versions of the toolkit.
     */
    private createSSHConfigV1(proxyCommand: string): string {
        return `
# Created by AWS Toolkit for VSCode. https://github.com/aws/aws-toolkit-vscode
Host ${this.configHostName}
    ForwardAgent yes
    AddKeysToAgent yes
    StrictHostKeyChecking accept-new
    ProxyCommand ${proxyCommand}
    User '%r'
    `
    }

    /**
     * Creates SageMaker-specific SSH config section (current version).
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
