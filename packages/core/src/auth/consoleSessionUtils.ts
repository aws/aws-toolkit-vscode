/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { parseKnownFiles } from '@smithy/shared-ini-file-loader'
import { globals } from 'aws-core-vscode/shared'
import { getLogger } from '../shared/logger/logger'
import { ChildProcess } from '../shared/utilities/processUtils'
import { getOrInstallCli, updateAwsCli } from '../shared/utilities/cliUtils'
import { CancellationError } from '../shared/utilities/timeoutUtils'
import { ToolkitError } from '../shared/errors'
import { telemetry } from '../shared/telemetry/telemetry'
import { Auth } from './auth'
import { CredentialsId, asString } from './providers/credentials'
import { createRegionPrompter } from '../shared/ui/common/region'

/**
 * @description Authenticates with AWS using browser-based login via AWS CLI.
 * Creates a session profile and automatically activates it.
 *
 * @param profileName Optional profile name. If not provided, user will be prompted.
 * @param region Optional AWS region. If not provided, user will be prompted.
 */
export async function authenticateWithConsoleLogin(profileName?: string, region?: string): Promise<void> {
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
            throw new ToolkitError('User cancelled entering profile', {
                cancelled: true,
            })
        }

        profileName = profileNameInput.trim()
    }

    // After user interaction has occurred, we can safely emit telemetry
    await telemetry.auth_consoleLoginCommand.run(async (span) => {
        span.record({ authConsoleLoginStarted: true }) // Track entry into flow (raw count)

        // Prompt for region if not provided
        if (!region) {
            const regionPrompter = createRegionPrompter(undefined, {
                title: localize('AWS.message.prompt.consoleLogin.region', 'Select an AWS region for console login'),
            })

            const selectedRegion = await regionPrompter.prompt()

            if (!selectedRegion || typeof selectedRegion === 'symbol') {
                throw new ToolkitError('User cancelled selecting region', {
                    cancelled: true,
                })
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
            throw new ToolkitError('Failed to verify or install AWS CLI', {
                code: 'CliInstallFailed',
                cause: error as Error,
            })
        }

        // Execute login with console credentials command
        // At this point, profileName and region are guaranteed to be defined
        if (!profileName || !region) {
            throw new ToolkitError('Profile name and region are required')
        }

        logger.info(`Executing login with console credentials command for profile: ${profileName}, region: ${region}`)

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
                title: localize('AWS.message.progress.consoleLogin', 'Login with console credentials'),
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
                        // Check if profile is already configured with a session
                        const overwriteMatch = text.match(
                            /Profile .+ is already configured to use session .+\. Do you want to overwrite it to use .+ instead\?/s
                        )
                        if (overwriteMatch) {
                            const cliMessage = overwriteMatch[0].trim() // Extract the matched string
                            const overwriteBtn = localize('AWS.generic.overwrite', 'Overwrite')
                            const cancelBtn = localize('AWS.generic.cancel', 'Cancel')
                            void vscode.window
                                .showInformationMessage(cliMessage, overwriteBtn, cancelBtn)
                                .then(async (selection) => {
                                    if (selection === overwriteBtn && loginProcess) {
                                        // Send "y" to stdin to proceed with overwrite
                                        await loginProcess.send('y\n')
                                    } else if (loginProcess) {
                                        // User cancelled, stop the process
                                        await loginProcess.send('n\n')
                                        userCancelled = true
                                    }
                                })
                        }
                    },
                })

                // Handle cancellation
                token.onCancellationRequested(() => {
                    userCancelled = true
                    loginProcess?.stop()
                })

                return await loginProcess.run()
            }
        )

        // Check if user cancelled
        if (userCancelled) {
            void vscode.window.showInformationMessage(
                localize('AWS.message.info.consoleLogin.cancelled', 'Login with console credentials was cancelled.')
            )
            throw new ToolkitError('User cancelled login with console credentials', {
                cancelled: true,
            })
        }

        if (result.exitCode === 0) {
            telemetry.aws_consoleLoginCLISuccess.emit({ result: 'Succeeded' })
            // Show generic success message
            void vscode.window.showInformationMessage(
                localize(
                    'AWS.message.success.consoleLogin',
                    'Login with console credentials command completed. Profile "{0}" is now available.',
                    profileName
                )
            )
            logger.info('Login with console credentials command completed. Exit code: %d', result.exitCode)
        } else if (result.exitCode === 254) {
            logger.error(
                'AWS Sign-in service returned an error. Exit code %d: %s',
                result.exitCode,
                result.stdout || result.stderr
            )
            void vscode.window.showErrorMessage(
                localize(
                    'AWS.message.error.consoleLogin.signinServiceError',
                    'Unable to sign in with console credentials in "{0}". Please try another region.',
                    region
                )
            )
            throw new ToolkitError('AWS Sign-in service returned an error', {
                code: 'SigninServiceError',
                details: {
                    exitCode: result.exitCode,
                },
            })
        } else if (result.exitCode === 252) {
            // AWS CLI is outdated, attempt to update
            try {
                await updateAwsCli()
            } catch (err) {
                if (CancellationError.isUserCancelled(err)) {
                    throw new ToolkitError('User cancelled updating AWS CLI', {
                        cancelled: true,
                    })
                }
                logger.error('Failed to update AWS CLI: %O', err)
                throw ToolkitError.chain(err, 'AWS CLI update failed')
            }
            // If we reach here, update attempt completed
            const message = 'AWS CLI installer has started. After installation completes, try logging in again.'
            void vscode.window.showWarningMessage(message)
            throw new ToolkitError(message, { cancelled: true })
        } else {
            // Show generic error message
            void vscode.window.showErrorMessage(
                localize(
                    'AWS.message.error.consoleLogin.commandFailed',
                    `Login using console credentials with 'aws login' command failed with exit code ${result.exitCode}`
                )
            )
            logger.error(
                'Login with console credentials command failed with exit code %d: %s',
                result.exitCode,
                result.stdout || result.stderr
            )
            throw new ToolkitError(`Login with console credentials command failed with exit code ${result.exitCode}`, {
                code: 'CommandFailed',
            })
        }

        // Load and verify profile with ignoreCache to get newly written config from disk to catch CLI's async writes
        logger.info(`Verifying profile configuration for ${profileName}`)
        const profiles = await parseKnownFiles({ ignoreCache: true })
        const profile = profiles[profileName]
        logger.info('Profile found: %O', profile)
        logger.info('Login session value: %s, type: %s', profile?.login_session, typeof profile?.login_session)
        if (!profiles[profileName]?.login_session) {
            throw new ToolkitError(`Console login succeeded but profile ${profileName} not properly configured`, {
                code: 'ConsoleLoginConfigError',
            })
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
            // Invalidate cached credentials to force fresh fetch
            getLogger().info(`Invalidated cached credentials for ${connectionId}`)
            globals.loginManager.store.invalidateCredentials(credentialsId)
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

            // Don't call useConnection() - let credentials be fetched naturally when needed
            await Auth.instance.updateConnectionState(connectionId, 'valid')
        } catch (error: any) {
            logger.error('Failed to activate profile: %O', error)
            void vscode.window.showErrorMessage(
                localize(
                    'AWS.message.error.consoleLogin.profileActivationFailed',
                    'Failed to activate profile: {0}',
                    error instanceof Error ? error.message : String(error)
                )
            )
            throw new ToolkitError('Failed to activate profile', {
                code: 'ProfileActivationFailed',
                cause: error as Error,
            })
        }
    })
}
