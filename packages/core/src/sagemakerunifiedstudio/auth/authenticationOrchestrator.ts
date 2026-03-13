/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../../shared/logger/logger'
import { ToolkitError } from '../../shared/errors'
import { SmusErrorCodes, isExpressDomain } from '../shared/smusUtils'
import { SmusAuthenticationProvider, setSmusIamModeDomainContext } from './providers/smusAuthenticationProvider'
import { CredentialsProvider } from '../../auth/providers/credentials'

import { SmusSsoAuthenticationUI } from './ui/ssoAuthentication'
import {
    SmusIamProfileSelector,
    IamProfileSelection,
    IamProfileEditingInProgress,
    IamProfileBackNavigation,
} from './ui/iamProfileSelection'
import { SmusAuthenticationPreferencesManager } from './utils/authenticationPreferences'
import { DataZoneCustomClientHelper } from '../shared/client/datazoneCustomClientHelper'
import { DomainSummary } from '@amzn/datazone-custom-client'
import { recordAuthTelemetry } from '../shared/telemetry'
import { updateRecentDomains, removeDomainFromCache } from './utils/domainCache'

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
        try {
            let profileSelection: IamProfileSelection | IamProfileEditingInProgress | IamProfileBackNavigation

            // If profile and region are provided, skip profile selection (re-authentication case)
            if (existingProfileName && existingRegion) {
                this.logger.debug(
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
                this.logger.debug('User chose to go back to authentication method selection')
                return { status: 'BACK' }
            }

            if ('isEditing' in profileSelection) {
                // User chose to edit credentials or is in editing mode
                this.logger.debug('User is editing credentials')
                return { status: 'EDITING' }
            }

            // At this point, we have a profile selected
            this.logger.debug(`Selected profile: ${profileSelection.profileName}, region: ${profileSelection.region}`)

            // Validate the selected profile
            const validation = await authProvider.validateIamProfile(profileSelection.profileName)
            if (!validation.isValid) {
                this.logger.debug(`Profile validation failed: ${validation.error}`)
                return { status: 'INVALID_PROFILE', error: validation.error || 'Profile validation failed' }
            }

            // Discovering domains with IAM sign-in enabled using IAM credentials. If no domain is discovered, throw an error.
            this.logger.debug('Discovering domains with IAM sign-in enabled using IAM credentials')

            const iamDomains = await this.findAllSmusIamDomains(
                authProvider,
                profileSelection.profileName,
                profileSelection.region
            )
            if (iamDomains.length === 0) {
                throw new ToolkitError(
                    `No domain with IAM sign-in enabled for the IAM role found in region ${profileSelection.region}`,
                    {
                        code: SmusErrorCodes.IamDomainNotFound,
                        cancelled: true,
                    }
                )
            }

            this.logger.debug(`Multiple IAM domains found (${iamDomains.length}), showing picker`)
            const selectedDomainId = await this.showIamDomainPicker(iamDomains, profileSelection.region)
            if (!selectedDomainId) {
                throw new ToolkitError('User cancelled domain selection', {
                    cancelled: true,
                    code: SmusErrorCodes.UserCancelled,
                })
            }
            // Detect actual domain type (EXPRESS = IAM domain) via GetDomain preferences
            try {
                const datazoneHelper = DataZoneCustomClientHelper.getInstance(
                    await authProvider.getCredentialsProviderForIamProfile(profileSelection.profileName),
                    profileSelection.region
                )
                const domainInfo = await datazoneHelper.getDomain(selectedDomainId)
                await setSmusIamModeDomainContext(isExpressDomain(domainInfo.preferences))
                const mode = domainInfo.preferences?.['DOMAIN_MODE'] ?? 'unknown'
                this.logger.info(`Domain ${selectedDomainId} mode: ${mode}`)
            } catch (err) {
                this.logger.warn(`Failed to detect domain type, defaulting to IAM: ${(err as Error).message}`)
                await setSmusIamModeDomainContext(true)
            }

            const domainUrl = `https://${selectedDomainId}.sagemaker.${profileSelection.region}.on.aws/`

            this.logger.info(`Using domain URL: ${domainUrl}`)

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

            this.logger.info(
                `Successfully connected with IAM profile ${profileSelection.profileName} in region ${profileSelection.region}`
            )

            // Extract domain ID and region for telemetry logging
            const domainId = connection.domainId
            const region = authProvider.getDomainRegion()

            this.logger.info(`Connected to SageMaker Unified Studio domain: ${domainId} in region ${region}`)
            await this.recordAuthTelemetry(span, authProvider, domainId, region)

            // Refresh the tree view to show authenticated state
            try {
                await vscode.commands.executeCommand('aws.smus.rootView.refresh')
            } catch (refreshErr) {
                this.logger.debug(`Failed to refresh views after login: ${(refreshErr as Error).message}`)
            }

            // After successful IAM authentication (IAM mode), automatically open project picker
            this.logger.debug('IAM authentication successful, opening project picker')
            try {
                await vscode.commands.executeCommand('aws.smus.switchProject')
            } catch (pickerErr) {
                this.logger.debug(`Failed to open project picker: ${(pickerErr as Error).message}`)
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
                this.logger.debug('IAM authentication cancelled by user or failed due to customer error')
                throw error // Re-throw to be handled by the main loop
            } else {
                // Log the error for actual failures
                this.logger.error('IAM authentication failed: %s', (error as Error).message)
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
        this.logger.debug('Starting SSO authentication flow')

        // Show domain URL input dialog with back button support
        const domainUrl = await SmusSsoAuthenticationUI.showDomainUrlInput()

        this.logger.debug(`Domain URL input result: ${domainUrl ? 'provided' : 'cancelled or back'}`)

        if (domainUrl === 'BACK') {
            // User wants to go back to authentication method selection
            this.logger.debug('User chose to go back from domain URL input')
            return { status: 'BACK' }
        }

        if (!domainUrl) {
            // User cancelled
            this.logger.debug('User cancelled domain URL input')
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

            this.logger.info(`Connected to SageMaker Unified Studio domain: ${domainId} in region ${region}`)
            await this.recordAuthTelemetry(span, authProvider, domainId, region)

            // Update domain cache after successful authentication with domain name
            try {
                // Try to fetch domain name from DataZone
                let domainName: string | undefined
                try {
                    this.logger.debug(`Fetching domain name for domain ID: ${domainId} in region: ${region}`)

                    // Get DataZone client helper instance
                    const datazoneHelper = DataZoneCustomClientHelper.getInstance(
                        (await authProvider.getDerCredentialsProvider()) as CredentialsProvider,
                        region
                    )

                    // Fetch domain information
                    const domainInfo = await datazoneHelper.getDomain(domainId)
                    domainName = domainInfo.name

                    // Set domain mode flag based on preferences
                    await setSmusIamModeDomainContext(isExpressDomain(domainInfo.preferences))
                    const mode = domainInfo.preferences?.['DOMAIN_MODE'] ?? 'unknown'
                    this.logger.info(`Domain ${domainId} mode: ${mode}`)

                    this.logger.debug(`Successfully fetched domain name: ${domainName}`)
                } catch (fetchErr) {
                    // If we can't fetch the domain name, that's okay - we'll cache without it
                    this.logger.warn(`Failed to fetch domain name from DataZone: ${(fetchErr as Error).message}`)
                }

                // Update cache with domain URL and optional name
                await updateRecentDomains(domainUrl, domainName)
                this.logger.debug(`Updated domain cache with: ${domainUrl}${domainName ? ` (${domainName})` : ''}`)
            } catch (cacheErr) {
                // Cache failures should not block authentication flow
                this.logger.warn(`Failed to update domain cache: ${(cacheErr as Error).message}`)
            }

            // Ask to remember authentication method preference
            await this.askToRememberAuthMethod(context, 'sso')

            // Immediately refresh the tree view to show authenticated state
            try {
                await vscode.commands.executeCommand('aws.smus.rootView.refresh')
            } catch (refreshErr) {
                this.logger.debug(`Failed to refresh views after login: ${(refreshErr as Error).message}`)
            }

            return { status: 'SUCCESS' }
        } catch (connectionErr) {
            // Handle authentication errors and update cache accordingly
            await this.handleAuthenticationError(domainUrl, connectionErr as Error)

            // Clear the status bar message
            vscode.window.setStatusBarMessage('Connection to SageMaker Unified Studio Failed')

            // Log the error and re-throw to be handled by the outer catch block
            this.logger.error('Connection failed: %s', (connectionErr as Error).message)
            throw new ToolkitError('Connection failed.', {
                cause: connectionErr as Error,
                code: (connectionErr as Error).name,
            })
        }
    }

    /**
     * Handles authentication errors and updates domain cache accordingly
     * @param domainUrl The domain URL that failed authentication
     * @param error The error that occurred during authentication
     */
    private static async handleAuthenticationError(domainUrl: string, error: Error): Promise<void> {
        const errorCode = (error as any).code

        // Check if failure is due to invalid URL format
        if (errorCode === SmusErrorCodes.InvalidDomainUrl) {
            // Validation error - remove from cache
            try {
                await removeDomainFromCache(domainUrl)
                this.logger.info(`Removed invalid domain from cache: ${domainUrl}`)
            } catch (cacheErr) {
                this.logger.warn(`Failed to remove domain from cache: ${(cacheErr as Error).message}`)
            }
        } else if (errorCode === SmusErrorCodes.ApiTimeout || errorCode === SmusErrorCodes.FailedToConnect) {
            // Network error - keep in cache for retry
            this.logger.warn(`Network error for domain ${domainUrl}, keeping in cache for retry`)
        } else {
            // Authentication error or other errors - keep in cache
            this.logger.warn(`Authentication failed for domain ${domainUrl}, keeping in cache`)
        }
    }

    /**
     * Asks the user if they want to remember their authentication method choice after successful login
     */
    private static async askToRememberAuthMethod(
        context: vscode.ExtensionContext,
        method: SmusAuthenticationMethod
    ): Promise<void> {
        try {
            const methodName = method === 'sso' ? 'SSO Authentication' : 'IAM Credential Profile'

            const result = await vscode.window.showInformationMessage(
                `Remember ${methodName} as your preferred authentication method for SageMaker Unified Studio?`,
                'Yes',
                'No'
            )

            if (result === 'Yes') {
                this.logger.debug(`Saving user preference: ${method}`)
                await SmusAuthenticationPreferencesManager.setPreferredMethod(context, method, true)
                this.logger.debug(`Preference saved successfully`)
            }
        } catch (error) {
            // Not a hard failure, so not throwing error
            this.logger.warn('Error asking to remember auth method: %s', error)
        }
    }

    /**
     * Finds all SMUS domains with IAM sign-in enabled using IAM credentials
     * @param authProvider The SMUS authentication provider
     * @param profileName The AWS credential profile name
     * @param region The AWS region
     * @returns Promise resolving to array of DomainSummary objects of domains with IAM sign-in enabled
     */
    private static async findAllSmusIamDomains(
        authProvider: SmusAuthenticationProvider,
        profileName: string,
        region: string
    ): Promise<DomainSummary[]> {
        try {
            this.logger.debug(
                `Finding domains with IAM sign-in enabled in region ${region} using profile ${profileName}`
            )

            const datazoneCustomClientHelper = DataZoneCustomClientHelper.getInstance(
                await authProvider.getCredentialsProviderForIamProfile(profileName),
                region
            )

            const iamDomains = await datazoneCustomClientHelper.getAllIamDomains()

            this.logger.debug(
                `Found ${iamDomains.length} domain(s) domain with IAM sign-in enabled in region ${region}`
            )
            return iamDomains
        } catch (error) {
            this.logger.error(`Failed to find domains with IAM sign-in enabled: %s`, error)
            throw new ToolkitError(`Failed to find domains with IAM sign-in enabled: ${(error as Error).message}`, {
                code: SmusErrorCodes.ApiTimeout,
                cause: error instanceof Error ? error : undefined,
            })
        }
    }

    /**
     * Shows a QuickPick for the user to select an IAM domain from a list
     * @param domains The list of IAM domains to choose from
     * @param region The AWS region
     * @returns Promise resolving to the selected domain URL, or undefined if cancelled
     */
    private static async showIamDomainPicker(domains: DomainSummary[], region: string): Promise<string | undefined> {
        return new Promise((resolve) => {
            const quickPick = vscode.window.createQuickPick()
            quickPick.title = 'Select a Domain'
            quickPick.placeholder = 'Multiple domains found. Select a domain to connect to.'
            quickPick.canSelectMany = false
            quickPick.ignoreFocusOut = true

            const items: vscode.QuickPickItem[] = domains.map((domain) => {
                const displayName = domain.name || domain.id
                return {
                    label: `$(globe) ${displayName} (${region})`,
                    description: domain.id,
                    detail: `Created at ${domain.createdAt}`,
                }
            })

            quickPick.items = items

            let isCompleted = false

            quickPick.onDidChangeSelection((selected) => {
                if (selected.length > 0) {
                    isCompleted = true
                    quickPick.dispose()
                    resolve(selected[0].description)
                }
            })

            quickPick.onDidHide(() => {
                if (!isCompleted) {
                    quickPick.dispose()
                    resolve(undefined)
                }
            })

            quickPick.show()
        })
    }

    /**
     * Finds SMUS IAM-based domain using IAM credentials
     * @param authProvider The SMUS authentication provider
     * @param profileName The AWS credential profile name
     * @param region The AWS region
     * @returns Promise resolving to domain URL or undefined if no IAM-based domain found
     */
    // @ts-ignore: Keeping for future use
    private static async findSmusIamDomain(
        authProvider: SmusAuthenticationProvider,
        profileName: string,
        region: string
    ): Promise<string | undefined> {
        try {
            this.logger.debug(`Finding IAM-based domain in region ${region} using profile ${profileName}`)

            // Get DataZoneCustomClientHelper instance
            const datazoneCustomClientHelper = DataZoneCustomClientHelper.getInstance(
                await authProvider.getCredentialsProviderForIamProfile(profileName),
                region
            )

            // Find the IAM-based domain using the client
            const iamDomain = await datazoneCustomClientHelper.getIamDomain()

            if (!iamDomain) {
                this.logger.warn(`No IAM-based domain found in region ${region}`)
                return undefined
            }

            this.logger.debug(`Found IAM-based domain: ${iamDomain.name} (${iamDomain.id})`)

            // Construct domain URL from the IAM-based domain
            const domainUrl = iamDomain.portalUrl || `https://${iamDomain.id}.sagemaker.${region}.on.aws/`
            this.logger.info(`Discovered IAM-based domain URL: ${domainUrl}`)

            return domainUrl
        } catch (error) {
            this.logger.error(`Failed to find IAM-based domain: %s`, error)
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
