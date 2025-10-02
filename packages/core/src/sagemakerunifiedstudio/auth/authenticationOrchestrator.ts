/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../../shared/logger/logger'
import { ToolkitError } from '../../shared/errors'
import { SmusErrorCodes } from '../shared/smusUtils'
import { SmusAuthenticationProvider } from './providers/smusAuthenticationProvider'
import { SmusSsoAuthenticationUI } from './ui/ssoAuthentication'
import { SmusIamProfileSelector } from './ui/iamProfileSelection'
import { SmusAuthenticationPreferencesManager } from './preferences/authenticationPreferences'

export type SmusAuthenticationMethod = 'sso' | 'iam'

/**
 * Orchestrates SMUS authentication flows
 */
export class SmusAuthenticationOrchestrator {
    private static readonly logger = getLogger()

    /**
     * Handles IAM authentication flow
     */
    public static async handleIamAuthentication(
        authProvider: SmusAuthenticationProvider,
        span: any,
        context: vscode.ExtensionContext
    ): Promise<'SUCCESS' | 'BACK'> {
        const logger = this.logger
        logger.debug('SMUS Auth: Starting IAM authentication flow')

        try {
            // Show IAM profile selection dialog
            const profileSelection = await SmusIamProfileSelector.showIamProfileSelection()

            // Handle different result types
            if ('isBack' in profileSelection) {
                // User chose to go back to authentication method selection
                logger.debug('SMUS Auth: User chose to go back to authentication method selection')
                return 'BACK'
            }

            if ('isEditing' in profileSelection) {
                // User chose to edit credentials or is in editing mode
                logger.debug('SMUS Auth: User is editing credentials')
                throw new ToolkitError('User is editing credentials. Please complete setup and try again.', {
                    code: SmusErrorCodes.UserCancelled,
                    cancelled: true,
                })
            }

            // At this point, we have a valid profile selection
            logger.debug(
                `SMUS Auth: Selected profile: ${profileSelection.profileName}, region: ${profileSelection.region}`
            )

            // Validate the selected profile
            const validation = await SmusIamProfileSelector.validateProfile(profileSelection.profileName)
            if (!validation.isValid) {
                throw new ToolkitError(`Profile validation failed: ${validation.error}`, {
                    code: 'InvalidProfile',
                })
            }

            // Show status message
            vscode.window.setStatusBarMessage('IAM profile selected successfully', 3000)

            // Show friendly message about selected profile and feature status
            void vscode.window.showInformationMessage(
                `Profile '${profileSelection.profileName}' (${profileSelection.region}) has been selected. ` +
                    'IAM authentication with SageMaker Unified Studio is not yet fully implemented. ' +
                    'Please use SSO authentication for now.',
                'OK'
            )

            logger.info(
                `SMUS Auth: Profile selected - ${profileSelection.profileName} in ${profileSelection.region}. Feature not yet implemented.`
            )

            // Ask to remember authentication method preference
            await this.askToRememberAuthMethod(context, 'iam')

            // Return success to complete the authentication flow gracefully
            return 'SUCCESS'
        } catch (error) {
            // Handle user cancellation (including editing mode)
            if (error instanceof ToolkitError && error.code === SmusErrorCodes.UserCancelled) {
                logger.debug('IAM authentication cancelled by user')
                throw error // Re-throw to be handled by the main loop
            } else {
                // Log the error for actual failures
                logger.error('IAM authentication failed: %s', (error as Error).message)
                throw error
            }
        }
    }

    /**
     * Handles SSO authentication flow
     */
    public static async handleSsoAuthentication(
        authProvider: SmusAuthenticationProvider,
        span: any,
        context: vscode.ExtensionContext
    ): Promise<'SUCCESS' | 'BACK'> {
        const logger = this.logger
        logger.debug('SMUS Auth: Starting SSO authentication flow')

        // Show domain URL input dialog with back button support
        const domainUrl = await SmusSsoAuthenticationUI.showDomainUrlInput()

        logger.debug(`SMUS Auth: Domain URL input result: ${domainUrl ? 'provided' : 'cancelled or back'}`)

        if (domainUrl === 'BACK') {
            // User wants to go back to authentication method selection
            logger.debug('User chose to go back from domain URL input')
            return 'BACK'
        }

        if (!domainUrl) {
            // User cancelled
            logger.debug('User cancelled domain URL input')
            throw new ToolkitError('User cancelled domain URL input', {
                cancelled: true,
                code: SmusErrorCodes.UserCancelled,
            })
        }

        try {
            // Connect to SMUS using the authentication provider
            const connection = await authProvider.connectToSmus(domainUrl)

            if (!connection) {
                throw new ToolkitError('Failed to establish connection', {
                    code: SmusErrorCodes.FailedAuthConnecton,
                })
            }

            // Extract domain account ID, domain ID, and region for logging
            const domainId = connection.domainId
            const region = connection.ssoRegion

            logger.info(`Connected to SageMaker Unified Studio domain: ${domainId} in region ${region}`)
            await this.recordAuthTelemetry(span, authProvider, domainId, region)

            // Ask to remember authentication method preference
            await this.askToRememberAuthMethod(context, 'sso')

            // Immediately refresh the tree view to show authenticated state
            try {
                await vscode.commands.executeCommand('aws.smus.rootView.refresh')
            } catch (refreshErr) {
                logger.debug(`Failed to refresh views after login: ${(refreshErr as Error).message}`)
            }

            return 'SUCCESS'
        } catch (connectionErr) {
            // Clear the status bar message
            vscode.window.setStatusBarMessage('Connection to SageMaker Unified Studio Failed')

            // Log the error and re-throw to be handled by the outer catch block
            logger.error('Connection failed: %s', (connectionErr as Error).message)
            throw new ToolkitError('Connection failed.', {
                cause: connectionErr as Error,
                code: (connectionErr as Error).name,
            })
        }
    }

    /**
     * Asks the user if they want to remember their authentication method choice after successful login
     */
    private static async askToRememberAuthMethod(
        context: vscode.ExtensionContext,
        method: SmusAuthenticationMethod
    ): Promise<void> {
        const logger = this.logger

        try {
            const methodName = method === 'sso' ? 'SSO Authentication' : 'IAM Credential Profile'

            const result = await vscode.window.showInformationMessage(
                `Remember ${methodName} as your preferred authentication method for SageMaker Unified Studio?`,
                'Yes',
                'No'
            )

            if (result === 'Yes') {
                logger.debug(`SMUS Auth: Saving user preference: ${method}`)
                await SmusAuthenticationPreferencesManager.setPreferredMethod(context, method, true)
                logger.debug(`SMUS Auth: Preference saved successfully`)
            }
        } catch (error) {
            // Not a hard failure, so not throwing error
            logger.warn('SMUS Auth: Error asking to remember auth method: %s', error)
        }
    }

    /**
     * Records authentication telemetry
     */
    private static async recordAuthTelemetry(
        span: any,
        authProvider: SmusAuthenticationProvider,
        domainId: string,
        region: string
    ): Promise<void> {
        // Import the telemetry function from the shared module
        const { recordAuthTelemetry } = await import('../shared/telemetry.js')
        await recordAuthTelemetry(span, authProvider, domainId, region)
    }
}
