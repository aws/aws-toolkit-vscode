/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLogger } from '../../../shared/logger/logger'
import { ToolkitError } from '../../../shared/errors'
import * as AWS from '@aws-sdk/types'
import { CredentialsId, CredentialsProvider, CredentialsProviderType } from '../../../auth/providers/credentials'

import { SmusAuthenticationProvider } from './smusAuthenticationProvider'
import { CredentialType } from '../../../shared/telemetry/telemetry'
import { SmusCredentialExpiry, validateCredentialFields } from '../../shared/smusUtils'
import { loadMappings, saveMappings } from '../../../awsService/sagemaker/credentialMapping'
import { createDZClientBaseOnDomainMode } from '../../explorer/nodes/utils'

/**
 * Credentials provider for SageMaker Unified Studio Project Role credentials
 * Uses Domain Execution Role (DER) credentials to get project-scoped credentials
 * via the DataZone GetEnvironmentCredentials API
 *
 * This provider implements independent caching with 10-minute expiry and can be used
 * with any AWS SDK client (S3Client, LambdaClient, etc.)
 */
export class ProjectRoleCredentialsProvider implements CredentialsProvider {
    private readonly logger = getLogger('smus')
    private credentialCache?: {
        credentials: AWS.Credentials
        expiresAt: Date
    }
    private refreshTimer?: NodeJS.Timeout
    private readonly refreshInterval = 10 * 60 * 1000 // 10 minutes
    private readonly checkInterval = 10 * 1000 // 10 seconds - check frequently, refresh based on actual time
    private sshRefreshActive = false
    private lastRefreshTime?: Date

    constructor(
        private readonly smusAuthProvider: SmusAuthenticationProvider,
        private readonly projectId: string
    ) {}

    /**
     * Gets the project ID
     * @returns Project ID
     */
    public getProjectId(): string {
        return this.projectId
    }

    /**
     * Gets the credentials ID
     * @returns Credentials ID
     */
    public getCredentialsId(): CredentialsId {
        return {
            credentialSource: 'temp',
            credentialTypeId: `${this.smusAuthProvider.getDomainId()}:${this.projectId}`,
        }
    }

    /**
     * Gets the provider type
     * @returns Provider type
     */
    public getProviderType(): CredentialsProviderType {
        return 'temp'
    }

    /**
     * Gets the telemetry type
     * @returns Telemetry type
     */
    public getTelemetryType(): CredentialType {
        return 'other'
    }

    /**
     * Gets the default region
     * @returns Default region
     */
    public getDefaultRegion(): string | undefined {
        return this.smusAuthProvider.getDomainRegion()
    }

    /**
     * Gets the hash code
     * @returns Hash code
     */
    public getHashCode(): string {
        const hashCode = `smus-project:${this.smusAuthProvider.getDomainId()}:${this.projectId}`
        return hashCode
    }

    /**
     * Determines if the provider can auto-connect
     * @returns Promise resolving to boolean
     */
    public async canAutoConnect(): Promise<boolean> {
        return false // SMUS requires manual authentication
    }

    /**
     * Determines if the provider is available
     * @returns Promise resolving to boolean
     */
    public async isAvailable(): Promise<boolean> {
        return this.smusAuthProvider.isConnected()
    }

    /**
     * Gets Project Role credentials with independent caching
     * @returns Promise resolving to credentials
     */
    public async getCredentials(): Promise<AWS.Credentials> {
        this.logger.debug(`Getting credentials for project ${this.projectId}`)

        // Check cache first (10-minute expiry)
        if (this.credentialCache && this.credentialCache.expiresAt > new Date()) {
            this.logger.debug(`Using cached project credentials for project ${this.projectId}`)
            return this.credentialCache.credentials
        }

        this.logger.debug(`Fetching project credentials from API for project ${this.projectId}`)

        try {
            const dataZoneClient = await createDZClientBaseOnDomainMode(this.smusAuthProvider)
            const response = await dataZoneClient.getProjectDefaultEnvironmentCreds(this.projectId)

            this.logger.debug(
                `SMUS Project: Successfully received response from GetEnvironmentCredentials API for project ${this.projectId}`
            )

            // Validate credential fields - credentials are returned directly in the response
            validateCredentialFields(response, 'InvalidProjectCredentialResponse', 'project credential response')

            // Create AWS credentials with expiration
            // Use the expiration from the response if available, otherwise default to 10 minutes
            let expiresAt: Date
            if (response.expiration) {
                // The API returns expiration as a string, parse it to Date
                expiresAt = new Date(response.expiration)
            } else {
                expiresAt = new Date(Date.now() + SmusCredentialExpiry.projectExpiryMs)
            }

            const awsCredentials: AWS.Credentials = {
                accessKeyId: response.accessKeyId as string,
                secretAccessKey: response.secretAccessKey as string,
                sessionToken: response.sessionToken as string,
                expiration: expiresAt,
            }

            // Cache project credentials
            this.credentialCache = {
                credentials: awsCredentials,
                expiresAt: expiresAt,
            }

            this.logger.debug(
                'SMUS Project: Successfully cached project credentials for project %s, expires in %s minutes',
                this.projectId,
                Math.round((expiresAt.getTime() - Date.now()) / 60000)
            )

            // Write project credentials to mapping file to be used by Sagemaker local server for remote connections
            await this.writeCredentialsToMapping(awsCredentials)

            return awsCredentials
        } catch (err) {
            this.logger.error('Failed to get project credentials for project %s: %s', this.projectId, err)

            // Handle InvalidGrantException specially - indicates need for reauthentication
            if (err instanceof Error && err.name === 'InvalidGrantException') {
                // Invalidate cache when authentication fails
                this.invalidate()
                throw new ToolkitError(
                    `Failed to get project credentials for project ${this.projectId}: ${err.message}. Reauthentication required.`,
                    {
                        code: 'InvalidRefreshToken',
                        cause: err,
                    }
                )
            }

            throw new ToolkitError(`Failed to get project credentials for project ${this.projectId}: ${err}`, {
                code: 'ProjectCredentialsFetchFailed',
                cause: err instanceof Error ? err : undefined,
            })
        }
    }

    /**
     * Writes project credentials to mapping file for local server usage
     */
    private async writeCredentialsToMapping(awsCredentials: AWS.Credentials): Promise<void> {
        try {
            const mapping = await loadMappings()
            mapping.smusProjects ??= {}
            mapping.smusProjects[this.projectId] = {
                accessKey: awsCredentials.accessKeyId,
                secret: awsCredentials.secretAccessKey,
                token: awsCredentials.sessionToken || '',
            }
            await saveMappings(mapping)
        } catch (err) {
            this.logger.warn('Failed to write project credentials to mapping file: %s', err)
        }
    }

    /**
     * Starts proactive credential refresh for SSH connections
     *
     * Uses an expiry-based approach with safety buffer:
     * - Checks every 10 seconds using setTimeout
     * - Refreshes when credentials expire within 5 minutes (safety buffer)
     * - Falls back to 10-minute time-based refresh if no expiry information available
     * - Handles sleep/resume because it uses wall-clock time for expiry checks
     *
     * This means credentials are refreshed just before they expire, reducing
     * unnecessary API calls while ensuring credentials remain valid.
     */
    public startProactiveCredentialRefresh(): void {
        if (this.sshRefreshActive) {
            this.logger.debug(`SSH refresh already active for project ${this.projectId}`)
            return
        }

        this.logger.info(`Starting SSH credential refresh for project ${this.projectId}`)
        this.sshRefreshActive = true
        this.lastRefreshTime = new Date() // Initialize refresh time

        // Start the check timer (checks every 10 seconds, refreshes every 10 minutes based on actual time)
        this.scheduleNextCheck()
    }

    /**
     * Stops proactive credential refresh
     * Called when SSH connection ends or SMUS disconnects
     */
    public stopProactiveCredentialRefresh(): void {
        if (!this.sshRefreshActive) {
            return
        }

        this.logger.info(`Stopping SSH credential refresh for project ${this.projectId}`)
        this.sshRefreshActive = false
        this.lastRefreshTime = undefined

        // Clean up timer
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer)
            this.refreshTimer = undefined
        }
    }

    /**
     * Schedules the next credential check (every 10 seconds)
     * Refreshes credentials when they expire within 5 minutes (safety buffer)
     * Falls back to 10-minute time-based refresh if no expiry information available
     * This handles sleep/resume scenarios correctly
     */
    private scheduleNextCheck(): void {
        if (!this.sshRefreshActive) {
            return
        }
        // Check every 10 seconds, but only refresh every 10 minutes based on actual time elapsed
        this.refreshTimer = setTimeout(async () => {
            try {
                const now = new Date()
                // Check if we need to refresh based on actual time elapsed
                if (this.shouldPerformRefresh(now)) {
                    await this.refresh()
                }
                // Schedule next check if still active
                if (this.sshRefreshActive) {
                    this.scheduleNextCheck()
                }
            } catch (error) {
                this.logger.error(
                    `SMUS Project: Failed to refresh credentials for project ${this.projectId}: %O`,
                    error
                )
                // Continue trying even if refresh fails. Dispose will handle stopping the refresh.
                if (this.sshRefreshActive) {
                    this.scheduleNextCheck()
                }
            }
        }, this.checkInterval)
    }

    /**
     * Determines if a credential refresh should be performed based on credential expiration
     * This handles sleep/resume scenarios properly and is more efficient than time-based refresh
     */
    private shouldPerformRefresh(now: Date): boolean {
        if (!this.lastRefreshTime || !this.credentialCache) {
            // First refresh or no cached credentials
            this.logger.debug(`First refresh - no previous credentials for ${this.projectId}`)
            return true
        }

        // Check if credentials expire soon (with 5-minute safety buffer)
        const safetyBufferMs = 5 * 60 * 1000 // 5 minutes before expiry
        const expiryTime = this.credentialCache.credentials.expiration?.getTime()

        if (!expiryTime) {
            // No expiry info - fall back to time-based refresh as safety net
            const timeSinceLastRefresh = now.getTime() - this.lastRefreshTime.getTime()
            const shouldRefresh = timeSinceLastRefresh >= this.refreshInterval
            return shouldRefresh
        }

        const timeUntilExpiry = expiryTime - now.getTime()
        const shouldRefresh = timeUntilExpiry < safetyBufferMs
        return shouldRefresh
    }

    /**
     * Performs credential refresh by invalidating cache and fetching fresh credentials
     */
    private async refresh(): Promise<void> {
        const now = new Date()
        const expiryTime = this.credentialCache?.credentials.expiration?.getTime()

        if (expiryTime) {
            const minutesUntilExpiry = Math.round((expiryTime - now.getTime()) / 60000)
            this.logger.debug(
                `SMUS Project: Refreshing credentials for project ${this.projectId} - expires in ${minutesUntilExpiry} minutes`
            )
        } else {
            const minutesSinceLastRefresh = this.lastRefreshTime
                ? Math.round((now.getTime() - this.lastRefreshTime.getTime()) / 60000)
                : 0
            this.logger.debug(
                `SMUS Project: Refreshing credentials for project ${this.projectId} - time-based refresh after ${minutesSinceLastRefresh} minutes`
            )
        }

        await this.getCredentials()
        this.lastRefreshTime = new Date()
    }

    /**
     * Invalidates cached project credentials
     * Clears the internal cache without fetching new credentials
     */
    public invalidate(): void {
        this.logger.debug(`Invalidating cached credentials for project ${this.projectId}`)
        // Clear cache to force fresh fetch on next getCredentials() call
        this.credentialCache = undefined
        this.logger.debug(
            `SMUS Project: Successfully invalidated project credentials cache for project ${this.projectId}`
        )
    }

    /**
     * Disposes of the provider and cleans up resources
     */
    public dispose(): void {
        this.stopProactiveCredentialRefresh()
        this.invalidate()
    }
}
