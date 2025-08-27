/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLogger } from '../../../shared/logger/logger'
import { ToolkitError } from '../../../shared/errors'
import * as AWS from '@aws-sdk/types'
import { CredentialsId, CredentialsProvider, CredentialsProviderType } from '../../../auth/providers/credentials'
import fetch from 'node-fetch'
import globals from '../../../shared/extensionGlobals'
import { CredentialType } from '../../../shared/telemetry/telemetry'
import { SmusCredentialExpiry, SmusTimeouts, SmusErrorCodes, validateCredentialFields } from '../../shared/smusUtils'

/**
 * Credentials provider for SageMaker Unified Studio Domain Execution Role (DER)
 * Uses SSO tokens to get DER credentials via the /sso/redeem-token endpoint
 *
 * This provider implements internal caching with 10-minute expiry and handles
 * its own credential lifecycle independently
 */
export class DomainExecRoleCredentialsProvider implements CredentialsProvider {
    private readonly logger = getLogger()
    private credentialCache?: {
        credentials: AWS.Credentials
        expiresAt: Date
    }

    constructor(
        private readonly domainUrl: string,
        private readonly domainId: string,
        private readonly ssoRegion: string,
        private readonly getAccessToken: () => Promise<string> // Function to get SSO access token for the Connection
    ) {}

    /**
     * Gets the domain ID
     * @returns Domain ID
     */
    public getDomainId(): string {
        return this.domainId
    }

    /**
     * Gets the domain URL
     * @returns Domain URL
     */
    public getDomainUrl(): string {
        return this.domainUrl
    }

    /**
     * Gets the credentials ID
     * @returns Credentials ID
     */
    public getCredentialsId(): CredentialsId {
        return {
            credentialSource: 'sso',
            credentialTypeId: this.domainId,
        }
    }

    /**
     * Gets the provider type
     * @returns Provider type
     */
    public getProviderType(): CredentialsProviderType {
        return 'sso'
    }

    /**
     * Gets the telemetry type
     * @returns Telemetry type
     */
    public getTelemetryType(): CredentialType {
        return 'ssoProfile'
    }

    /**
     * Gets the default region
     * @returns Default region
     */
    public getDefaultRegion(): string | undefined {
        return this.ssoRegion
    }

    /**
     * Gets the hash code
     * @returns Hash code
     */
    public getHashCode(): string {
        const hashCode = `smus-der:${this.domainId}:${this.ssoRegion}`
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
        try {
            // Check if we can get an access token
            await this.getAccessToken()
            return true
        } catch {
            return false
        }
    }

    /**
     * Gets Domain Execution Role (DER) credentials with internal caching
     * @returns Promise resolving to credentials
     */
    public async getCredentials(): Promise<AWS.Credentials> {
        this.logger.debug(`SMUS DER: Getting DER credentials for domain ${this.domainId}`)

        // Check cache first (10-minute expiry with 5-minute buffer for proactive refresh)
        if (this.credentialCache && this.credentialCache.expiresAt > new Date()) {
            this.logger.debug(`SMUS DER: Using cached DER credentials for domain ${this.domainId}`)
            return this.credentialCache.credentials
        }

        this.logger.debug(`SMUS DER: Fetching credentials from API for domain ${this.domainId}`)

        try {
            // Get current SSO access token
            const accessToken = await this.getAccessToken()
            if (!accessToken) {
                throw new ToolkitError('No access token available for DER credential refresh', {
                    code: 'NoTokenAvailable',
                })
            }

            this.logger.debug(`SMUS DER: Got access token for refresh for domain ${this.domainId}`)

            // Call SMUS redeem token API to get DER credentials
            const redeemUrl = new URL('/sso/redeem-token', this.domainUrl)
            this.logger.debug(`SMUS DER: Calling redeem token endpoint: ${redeemUrl.toString()}`)

            const requestBody = {
                domainId: this.domainId,
                accessToken,
            }

            const requestHeaders = {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                'User-Agent': 'aws-toolkit-vscode',
            }

            let response
            try {
                response = await fetch(redeemUrl.toString(), {
                    method: 'POST',
                    headers: requestHeaders,
                    body: JSON.stringify(requestBody),
                    timeout: SmusTimeouts.apiCallTimeoutMs,
                })
            } catch (fetchError) {
                // Handle timeout errors specifically
                if (
                    fetchError instanceof Error &&
                    (fetchError.name === 'AbortError' || fetchError.message.includes('timeout'))
                ) {
                    throw new ToolkitError(
                        `Redeem token request timed out after ${SmusTimeouts.apiCallTimeoutMs / 1000} seconds`,
                        {
                            code: SmusErrorCodes.ApiTimeout,
                            cause: fetchError,
                        }
                    )
                }
                // Re-throw other fetch errors
                throw fetchError
            }

            this.logger.debug(`SMUS DER: Redeem token response status: ${response.status} for domain ${this.domainId}`)

            if (!response.ok) {
                // Try to get response body for more details
                let responseBody = ''
                try {
                    responseBody = await response.text()
                    this.logger.debug(`SMUS DER: Error response body for domain ${this.domainId}: ${responseBody}`)
                } catch (bodyErr) {
                    this.logger.debug(
                        `SMUS DER: Could not read error response body for domain ${this.domainId}: ${bodyErr}`
                    )
                }

                throw new ToolkitError(
                    `Failed to redeem access token: ${response.status} ${response.statusText}${responseBody ? ` - ${responseBody}` : ''}`,
                    { code: SmusErrorCodes.RedeemAccessTokenFailed }
                )
            }

            const data = (await response.json()) as {
                credentials: {
                    accessKeyId: string
                    secretAccessKey: string
                    sessionToken: string
                    expiration: string
                }
            }

            this.logger.debug(`SMUS DER: Successfully received credentials from API for domain ${this.domainId}`)

            // Validate the response data structure
            if (!data.credentials) {
                throw new ToolkitError('Missing credentials object in API response', {
                    code: 'InvalidCredentialResponse',
                })
            }

            const credentials = data.credentials

            // Validate the credential fields
            validateCredentialFields(credentials, 'InvalidCredentialResponse', 'API response')

            // Create credentials with expiration
            // Note: The response doesn't include expiration yet, so we set it to 10 minutes for now if it does't exist
            let credentialExpiresAt: Date
            if (credentials.expiration) {
                // The API returns expiration as a string, convert to Date
                const parsedExpiration = new Date(credentials.expiration)
                // Check if the parsed date is valid
                if (isNaN(parsedExpiration.getTime())) {
                    this.logger.warn(
                        `SMUS DER: Invalid expiration date string: ${credentials.expiration}, using default expiration`
                    )
                    credentialExpiresAt = new Date(Date.now() + SmusCredentialExpiry.derExpiryMs)
                } else {
                    credentialExpiresAt = parsedExpiration
                }
            } else {
                credentialExpiresAt = new Date(Date.now() + SmusCredentialExpiry.derExpiryMs)
            }

            const awsCredentials: AWS.Credentials = {
                accessKeyId: credentials.accessKeyId as string,
                secretAccessKey: credentials.secretAccessKey as string,
                sessionToken: credentials.sessionToken as string,
                expiration: credentialExpiresAt,
            }

            // Cache DER credentials with 10-minute expiry (5-minute buffer for proactive refresh)
            const cacheExpiresAt = new globals.clock.Date(Date.now() + SmusCredentialExpiry.derExpiryMs)
            this.credentialCache = {
                credentials: awsCredentials,
                expiresAt: cacheExpiresAt,
            }

            this.logger.debug(
                'SMUS DER: Successfully cached DER credentials for domain %s, cache expires in %s minutes',
                this.domainId,
                Math.round((cacheExpiresAt.getTime() - Date.now()) / 60000)
            )

            return awsCredentials
        } catch (err) {
            this.logger.error('SMUS DER: Failed to fetch credentials for domain %s: %s', this.domainId, err)
            throw new ToolkitError(`Failed to fetch DER credentials for domain ${this.domainId}: ${err}`, {
                code: 'DerCredentialsFetchFailed',
                cause: err instanceof Error ? err : undefined,
            })
        }
    }

    /**
     * Invalidates cached DER credentials
     * Clears the internal cache without fetching new credentials
     */
    public invalidate(): void {
        this.logger.debug(`SMUS DER: Invalidating cached DER credentials for domain ${this.domainId}`)
        // Clear cache to force fresh fetch on next getCredentials() call
        this.credentialCache = undefined
        this.logger.debug(`SMUS DER: Successfully invalidated DER credentials cache for domain ${this.domainId}`)
    }
}
