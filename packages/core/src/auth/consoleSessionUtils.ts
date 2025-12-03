/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { getLogger } from '../shared/logger/logger'
import { ChildProcess } from '../shared/utilities/processUtils'
import { getOrInstallCli } from '../shared/utilities/cliUtils'
import { ToolkitError } from '../shared/errors'
import { Auth } from './auth'
import { CredentialsId, asString } from './providers/credentials'
import { createRegionPrompter } from '../shared/ui/common/region'

/**
 * @description Authenticates with AWS using browser-based login via AWS CLI.
 * Creates a session profile and automatically activates it.
 *
 * @param profileName Optional profile name. If not provided, user will be prompted.
 * @param region Optional AWS region. If not provided, user will be prompted.
 * @returns The profile name on success, undefined on failure or cancellation.
 */
export async function authenticateWithConsoleLogin(profileName?: string, region?: string): Promise<string | undefined> {
    const logger = getLogger()

    // Prompt for profile name if not provided
    if (!profileName) {
        const profileNameInput = await vscode.window.showInputBox({
            prompt: localize('AWS.message.prompt.consoleLogin.profileName', 'Enter a name for this profile'),
            placeHolder: localize('AWS.message.placeholder.consoleLogin.profileName', 'profile-name'),
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return localize('AWS.message.error.consoleLogin.emptyProfileName', 'Profile name cannot be empty')
                }
                if (/\s/.test(value)) {
                    return localize(
                        'AWS.message.error.consoleLogin.spacesInProfileName',
                        'Profile name cannot contain spaces'
                    )
                }
                if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
                    return localize(
                        'AWS.message.error.consoleLogin.invalidCharacters',
                        'Profile name can only contain letters, numbers, underscores, and hyphens'
                    )
                }
                return undefined
            },
        })

        if (!profileNameInput) {
            // User cancelled
            return undefined
        }

        profileName = profileNameInput.trim()
    }

    // Prompt for region if not provided
    if (!region) {
        const regionPrompter = createRegionPrompter(undefined, {
            title: localize('AWS.message.prompt.consoleLogin.region', 'Select an AWS region for console login'),
        })

        const selectedRegion = await regionPrompter.prompt()

        if (!selectedRegion || typeof selectedRegion === 'symbol') {
            // User cancelled
            return undefined
        }

        // TypeScript narrowing: at this point selectedRegion is Region
        const regionResult = selectedRegion as { id: string }
        region = regionResult.id
    }

    // Verify AWS CLI availability and install if needed
    let awsCliPath: string
    try {
        logger.info('Verifying AWS CLI availability...')
        awsCliPath = await getOrInstallCli('aws-cli', true)
        logger.info('AWS CLI found at: %s', awsCliPath)
    } catch (error) {
        logger.error('Failed to verify or install AWS CLI: %O', error)
        void vscode.window.showErrorMessage(
            localize(
                'AWS.message.error.consoleLogin.cliInstallFailed',
                'Failed to install AWS CLI. Please install it manually.'
            )
        )
        return undefined
    }

    // Execute aws login command
    try {
        // At this point, profileName and region are guaranteed to be defined
        if (!profileName || !region) {
            throw new ToolkitError('Profile name and region are required')
        }

        logger.info(`Executing aws login command for profile: ${profileName}, region: ${region}`)

        const commandArgs = ['login', '--profile', profileName, '--region', region]

        // Track if we've shown the URL dialog and if user cancelled
        let urlShown = false
        let loginUrl: string | undefined
        let userCancelled = false

        let loginProcess: ChildProcess | undefined

        // Start the process and handle output with cancellation support
        const result = await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: localize('AWS.message.progress.consoleLogin', 'AWS Console Login'),
                cancellable: true,
            },
            async (progress, token) => {
                progress.report({
                    message: localize(
                        'AWS.message.progress.waitingForBrowser',
                        'Waiting for browser authentication...'
                    ),
                })

                loginProcess = new ChildProcess(awsCliPath, commandArgs, {
                    collect: true,
                    rejectOnErrorCode: false,
                    onStdout: (text: string) => {
                        // Enhance the UX by showing AWS Sign-in service (signin.aws.amazon.com) URL in VS Code when we detect it.
                        const urlMatch = text.match(/(https:\/\/[^\s]+signin\.aws\.amazon\.com[^\s]+)/i)
                        if (urlMatch && !urlShown) {
                            loginUrl = urlMatch[1]
                            urlShown = true

                            // Show URL with Copy button (non-blocking)
                            const copyUrl = localize('AWS.button.copyUrl', 'Copy URL')
                            void vscode.window
                                .showInformationMessage(
                                    localize(
                                        'AWS.message.info.consoleLogin.browserAuth',
                                        'Attempting to open your default browser.\nIf the browser does not open, copy the URL:\n\n{0}',
                                        loginUrl
                                    ),
                                    copyUrl
                                )
                                .then(async (selection) => {
                                    if (selection === copyUrl && loginUrl) {
                                        await vscode.env.clipboard.writeText(loginUrl)
                                        void vscode.window.showInformationMessage(
                                            localize(
                                                'AWS.message.info.urlCopied',
                                                'AWS Sign-in URL copied to clipboard.'
                                            )
                                        )
                                    }
                                })
                        }
                    },
                })

                // Handle cancellation
                token.onCancellationRequested(() => {
                    logger.info('User cancelled console login')
                    userCancelled = true
                    loginProcess?.stop()
                })

                return await loginProcess.run()
            }
        )

        // Check if user cancelled
        if (userCancelled) {
            logger.info('Console login was cancelled by user')
            void vscode.window.showInformationMessage(
                localize('AWS.message.info.consoleLogin.cancelled', 'AWS Console Login was cancelled.')
            )
            return undefined
        }

        if (result.exitCode === 0) {
            // Show generic success message
            void vscode.window.showInformationMessage(
                localize(
                    'AWS.message.success.consoleLogin',
                    'AWS Console Login successful! Profile "{0}" is now available.',
                    profileName
                )
            )
            logger.info('AWS login command completed successfully')
        } else {
            // Show generic error message
            void vscode.window.showErrorMessage(
                localize('AWS.message.error.consoleLogin.commandFailed', 'AWS Console Login failed.')
            )
            logger.error(
                'AWS login command failed with exit code %d: %s',
                result.exitCode,
                result.stdout || result.stderr
            )
            return undefined
        }
    } catch (error) {
        logger.error('Error executing aws login command: %O', error)
        void vscode.window.showErrorMessage(
            localize(
                'AWS.message.error.consoleLogin.executionFailed',
                'Failed to execute AWS login command: {0}',
                error instanceof Error ? error.message : String(error)
            )
        )
        return undefined
    }

    // Activate the newly created profile
    try {
        logger.info(`Activating profile: ${profileName}`)
        // Connection ID format is "profile:profileName"
        const credentialsId: CredentialsId = {
            credentialSource: 'profile',
            credentialTypeId: profileName,
        }
        const connectionId = asString(credentialsId)
        logger.info(`Looking for connection with ID: ${connectionId}`)

        const connection = await Auth.instance.getConnection({ id: connectionId })
        if (connection === undefined) {
            // Log available connections for debugging
            const availableConnections = await Auth.instance.listConnections()
            logger.error(
                'Connection not found. Available connections: %O',
                availableConnections.map((c) => c.id)
            )
            throw new ToolkitError(`Failed to get connection from profile: ${connectionId}`, {
                code: 'MissingConnection',
            })
        }

        await Auth.instance.useConnection(connection)
        logger.info('Profile activated successfully')
    } catch (error) {
        logger.error('Failed to activate profile: %O', error)
        void vscode.window.showErrorMessage(
            localize(
                'AWS.message.error.consoleLogin.profileActivationFailed',
                'Failed to activate profile: {0}',
                error instanceof Error ? error.message : String(error)
            )
        )
        return undefined
    }

    return profileName
}
