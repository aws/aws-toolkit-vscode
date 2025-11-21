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
import {
    SmusIamProfileSelector,
    IamProfileSelection,
    IamProfileEditingInProgress,
    IamProfileBackNavigation,
} from './ui/iamProfileSelection'
import { SmusAuthenticationPreferencesManager } from './preferences/authenticationPreferences'
import { DataZoneCustomClientHelper } from '../shared/client/datazoneCustomClientHelper'
import { recordAuthTelemetry } from '../shared/telemetry'

export type SmusAuthenticationMethod = 'sso' | 'iam'

export type SmusAuthenticationResult =
    | { status: 'SUCCESS' }
    | { status: 'BACK' }
    | { status: 'EDITING' }
    | { status: 'INVALID_PROFILE'; error: string }

/**
 * Orchestrates SMUS authentication flows
 */
export class SmusAuthenticationOrchestrator {
    private static readonly logger = getLogger('smus')

    /**
     * Handles IAM authentication flow
     * @param authProvider The SMUS authentication provider
     * @param span Telemetry span
     * @param context Extension context
     * @param existingProfileName Optional profile name to re-authenticate with (skips profile selection)
     * @param existingRegion Optional region to use (skips region selection)
     */
    public static async handleIamAuthentication(
        authProvider: SmusAuthenticationProvider,
        span: any,
        context: vscode.ExtensionContext,
        existingProfileName?: string,
        existingRegion?: string
    ): Promise<SmusAuthenticationResult> {
        const logger = this.logger

        try {
            let profileSelection: IamProfileSelection | IamProfileEditingInProgress | IamProfileBackNavigation

            // If profile and region are provided, skip profile selection (re-authentication case)
            if (existingProfileName && existingRegion) {
                logger.debug(
                    `Auth: Re-authenticating with existing profile: ${existingProfileName}, region: ${existingRegion}`
                )
                profileSelection = {
                    profileName: existingProfileName,
                    region: existingRegion,
                }
            } else {
                // Show IAM profile selection dialog
                profileSelection = await SmusIamProfileSelector.showIamProfileSelection()
            }

            // Handle different result types
            if ('isBack' in profileSelection) {
                // User chose to go back to authentication method selection
                logger.debug('User chose to go back to authentication method selection')
                return { status: 'BACK' }
            }

            if ('isEditing' in profileSelection) {
                // User chose to edit credentials or is in editing mode
                logger.debug('User is editing credentials')
                return { status: 'EDITING' }
            }

            // At this point, we have a profile selected
            logger.debug(`Selected profile: ${profileSelection.profileName}, region: ${profileSelection.region}`)

            // Validate the selected profile
            const validation = await authProvider.validateIamProfile(profileSelection.profileName)
            if (!validation.isValid) {
                logger.debug(`Profile validation failed: ${validation.error}`)
                return { status: 'INVALID_PROFILE', error: validation.error || 'Profile validation failed' }
            }

            // Discover IAM-based domain using IAM credential. If IAM-based domain is not present, we should throw an appropriate error
            // and exit
            logger.debug('Discovering IAM-based domain using IAM credentials')

            const domainUrl = await this.findSmusIamDomain(
                authProvider,
                profileSelection.profileName,
                profileSelection.region
            )
            if (!domainUrl) {
                throw new ToolkitError('No IAM-based domains found in the specified region', {
                    code: SmusErrorCodes.IamDomainNotFound,
                    cancelled: true,
                })
            }

            // Connect using IAM profile with IAM-based domain flag
            const connection = await authProvider.connectWithIamProfile(
                profileSelection.profileName,
                profileSelection.region,
                domainUrl,
                true // isIamDomain - we found an IAM-based domain
            )

            if (!connection) {
                throw new ToolkitError('Failed to establish IAM connection', {
                    code: SmusErrorCodes.FailedAuthConnecton,
                })
            }

            logger.info(
                `Successfully connected with IAM profile ${profileSelection.profileName} in region ${profileSelection.region} to IAM-based domain`
            )

            // Extract domain ID and region for telemetry logging
            const domainId = connection.domainId
            const region = authProvider.getDomainRegion()

            logger.info(`Connected to SageMaker Unified Studio domain: ${domainId} in region ${region}`)
            await this.recordAuthTelemetry(span, authProvider, domainId, region)

            // Refresh the tree view to show authenticated state
            try {
                await vscode.commands.executeCommand('aws.smus.rootView.refresh')
            } catch (refreshErr) {
                logger.debug(`Failed to refresh views after login: ${(refreshErr as Error).message}`)
            }

            // After successful IAM authentication (IAM mode), automatically open project picker
            logger.debug('IAM authentication successful, opening project picker')
            try {
                await vscode.commands.executeCommand('aws.smus.switchProject')
            } catch (pickerErr) {
                logger.debug(`Failed to open project picker: ${(pickerErr as Error).message}`)
            }

            // Ask to remember authentication method preference (non-blocking)
            void this.askToRememberAuthMethod(context, 'iam')

            // Return success to complete the authentication flow gracefully
            return { status: 'SUCCESS' }
        } catch (error) {
            // Handle user cancellation (including editing mode)
            if (
                error instanceof ToolkitError &&
                (error.code === SmusErrorCodes.UserCancelled || error.code === SmusErrorCodes.IamDomainNotFound)
            ) {
                logger.debug('IAM authentication cancelled by user or failed due to customer error')
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
    ): Promise<SmusAuthenticationResult> {
        const logger = this.logger
        logger.debug('Starting SSO authentication flow')

        // Show domain URL input dialog with back button support
        const domainUrl = await SmusSsoAuthenticationUI.showDomainUrlInput()

        logger.debug(`Domain URL input result: ${domainUrl ? 'provided' : 'cancelled or back'}`)

        if (domainUrl === 'BACK') {
            // User wants to go back to authentication method selection
            logger.debug('User chose to go back from domain URL input')
            return { status: 'BACK' }
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
            const connection = await authProvider.connectToSmusWithSso(domainUrl)

            if (!connection) {
                throw new ToolkitError('Failed to establish connection', {
                    code: SmusErrorCodes.FailedAuthConnecton,
                })
            }

            // Extract domain account ID, domain ID, and region for logging
            const domainId = connection.domainId
            const region = authProvider.getDomainRegion() // Use the auth provider method that handles both connection types

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

            return { status: 'SUCCESS' }
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
                logger.debug(`Saving user preference: ${method}`)
                await SmusAuthenticationPreferencesManager.setPreferredMethod(context, method, true)
                logger.debug(`Preference saved successfully`)
            }
        } catch (error) {
            // Not a hard failure, so not throwing error
            logger.warn('Error asking to remember auth method: %s', error)
        }
    }

    /**
     * Finds SMUS IAM-based domain using IAM credentials
     * @param authProvider The SMUS authentication provider
     * @param profileName The AWS credential profile name
     * @param region The AWS region
     * @returns Promise resolving to domain URL or undefined if no IAM-based domain found
     */
    private static async findSmusIamDomain(
        authProvider: SmusAuthenticationProvider,
        profileName: string,
        region: string
    ): Promise<string | undefined> {
        const logger = this.logger

        try {
            logger.debug(`Finding IAM-based domain in region ${region} using profile ${profileName}`)

            // Get DataZoneCustomClientHelper instance
            const datazoneCustomClientHelper = DataZoneCustomClientHelper.getInstance(
                await authProvider.getCredentialsProviderForIamProfile(profileName),
                region
            )

            // Find the IAM-based domain using the client
            const iamDomain = await datazoneCustomClientHelper.getIamDomain()

            if (!iamDomain) {
                logger.warn(`No IAM-based domain found in region ${region}`)
                return undefined
            }

            logger.debug(`Found IAM-based domain: ${iamDomain.name} (${iamDomain.id})`)

            // Construct domain URL from the IAM-based domain
            const domainUrl = iamDomain.portalUrl || `https://${iamDomain.id}.sagemaker.${region}.on.aws/`
            logger.info(`Discovered IAM-based domain URL: ${domainUrl}`)

            return domainUrl
        } catch (error) {
            logger.error(`Failed to find IAM-based domain: %s`, error)
            throw new ToolkitError(`Failed to find IAM-based domain: ${(error as Error).message}`, {
                code: SmusErrorCodes.ApiTimeout,
                cause: error instanceof Error ? error : undefined,
            })
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
        await recordAuthTelemetry(span, authProvider, domainId, region)
    }
}
