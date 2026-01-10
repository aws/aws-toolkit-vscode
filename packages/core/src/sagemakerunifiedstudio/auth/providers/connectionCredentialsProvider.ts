/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLogger } from '../../../shared/logger/logger'
import { ToolkitError } from '../../../shared/errors'
import * as AWS from '@aws-sdk/types'
import { CredentialsId, CredentialsProvider, CredentialsProviderType } from '../../../auth/providers/credentials'

import { DataZoneClient } from '../../shared/client/datazoneClient'
import { SmusAuthenticationProvider } from './smusAuthenticationProvider'
import { CredentialType } from '../../../shared/telemetry/telemetry'
import { SmusCredentialExpiry, validateCredentialFields } from '../../shared/smusUtils'
import { getContext } from '../../../shared/vscode/setContext'

/**
 * Credentials provider for SageMaker Unified Studio Connection credentials
 * Uses DataZone API to get connection credentials for a specific connection *
 * This provider implements independent caching with 10-minute expiry
 */
export class ConnectionCredentialsProvider implements CredentialsProvider {
    private readonly logger = getLogger('smus')
    private credentialCache?: {
        credentials: AWS.Credentials
        expiresAt: Date
    }

    constructor(
        private readonly smusAuthProvider: SmusAuthenticationProvider,
        private readonly connectionId: string,
        private readonly projectId: string
    ) {}

    /**
     * Gets the connection ID
     * @returns Connection ID
     */
    public getConnectionId(): string {
        return this.connectionId
    }

    /**
     * Gets the credentials ID
     * @returns Credentials ID
     */
    public getCredentialsId(): CredentialsId {
        return {
            credentialSource: 'temp',
            credentialTypeId: `${this.smusAuthProvider.getDomainId()}:${this.connectionId}`,
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
     * Gets the domain AWS account ID
     * @returns Promise resolving to the domain account ID
     */
    public async getDomainAccountId(): Promise<string> {
        return this.smusAuthProvider.getDomainAccountId()
    }

    /**
     * Gets the hash code
     * @returns Hash code
     */
    public getHashCode(): string {
        const hashCode = `smus-connection:${this.smusAuthProvider.getDomainId()}:${this.connectionId}`
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
            return this.smusAuthProvider.isConnected()
        } catch (err) {
            this.logger.error('Error checking if auth provider is connected: %s', err)
            return false
        }
    }

    /**
     * Gets Connection credentials with independent caching
     * @returns Promise resolving to credentials
     */
    public async getCredentials(): Promise<AWS.Credentials> {
        this.logger.debug(`Getting credentials for connection ${this.connectionId}`)

        // Check cache first (10-minute expiry)
        if (this.credentialCache && this.credentialCache.expiresAt > new Date()) {
            this.logger.debug(
                `SMUS Connection: Using cached connection credentials for connection ${this.connectionId}`
            )
            return this.credentialCache.credentials
        }

        this.logger.debug(
            `SMUS Connection: Calling GetConnection to fetch credentials for connection ${this.connectionId}`
        )

        try {
            if (getContext('aws.smus.isIamMode') && this.projectId) {
                return (await this.smusAuthProvider.getProjectCredentialProvider(this.projectId)).getCredentials()
            }
            const datazoneClient = DataZoneClient.createWithCredentials(
                this.smusAuthProvider.getDomainRegion(),
                this.smusAuthProvider.getDomainId(),
                await this.smusAuthProvider.getDerCredentialsProvider()
            )
            const getConnectionResponse = await datazoneClient.getConnection({
                domainIdentifier: this.smusAuthProvider.getDomainId(),
                identifier: this.connectionId,
                withSecret: true,
            })

            this.logger.debug(`Successfully retrieved connection details for ${this.connectionId}`)

            // Extract connection credentials
            const connectionCredentials = getConnectionResponse.connectionCredentials
            if (!connectionCredentials) {
                throw new ToolkitError(
                    `No connection credentials available in response for connection ${this.connectionId}`,
                    {
                        code: 'NoConnectionCredentials',
                    }
                )
            }

            // Validate credential fields
            validateCredentialFields(
                connectionCredentials,
                'InvalidConnectionCredentials',
                'connection credential response',
                true
            )

            // Create AWS credentials with expiration
            // Use the expiration from the response if available, otherwise default to 10 minutes
            let expiresAt: Date
            if (connectionCredentials.expiration) {
                // The API returns expiration as a string or Date, handle both cases
                expiresAt =
                    connectionCredentials.expiration instanceof Date
                        ? connectionCredentials.expiration
                        : new Date(connectionCredentials.expiration)
            } else {
                expiresAt = new Date(Date.now() + SmusCredentialExpiry.connectionExpiryMs)
            }

            const awsCredentials: AWS.Credentials = {
                accessKeyId: connectionCredentials.accessKeyId as string,
                secretAccessKey: connectionCredentials.secretAccessKey as string,
                sessionToken: connectionCredentials.sessionToken as string,
                expiration: expiresAt,
            }

            // Cache connection credentials (10-minute expiry)
            const cacheExpiresAt = new Date(Date.now() + SmusCredentialExpiry.connectionExpiryMs)
            this.credentialCache = {
                credentials: awsCredentials,
                expiresAt: cacheExpiresAt,
            }

            this.logger.debug(
                `SMUS Connection: Successfully cached connection credentials for connection ${this.connectionId}, expires in %s minutes`,
                Math.round((cacheExpiresAt.getTime() - Date.now()) / 60000)
            )

            return awsCredentials
        } catch (err) {
            this.logger.error(
                `SMUS Connection: Failed to get connection credentials for connection ${this.connectionId}: %s`,
                err
            )

            // Re-throw ToolkitErrors with specific codes (NoConnectionCredentials, InvalidConnectionCredentials)
            if (
                err instanceof ToolkitError &&
                (err.code === 'NoConnectionCredentials' || err.code === 'InvalidConnectionCredentials')
            ) {
                throw err
            }

            // Wrap other errors in ConnectionCredentialsFetchFailed
            throw new ToolkitError(`Failed to get connection credentials for ${this.connectionId}: ${err}`, {
                code: 'ConnectionCredentialsFetchFailed',
                cause: err instanceof Error ? err : undefined,
            })
        }
    }

    /**
     * Invalidates cached connection credentials
     * Clears the internal cache without fetching new credentials
     */
    public invalidate(): void {
        this.logger.debug(`Invalidating cached credentials for connection ${this.connectionId}`)
        // Clear cache to force fresh fetch on next getCredentials() call
        this.credentialCache = undefined
        this.logger.debug(
            `SMUS Connection: Successfully invalidated connection credentials cache for connection ${this.connectionId}`
        )
    }

    /**
     * Disposes of the provider and cleans up resources
     */
    public dispose(): void {
        this.logger.debug(
            `SMUS Connection: Disposing connection credentials provider for connection ${this.connectionId}`
        )
        // Clear cache to clean up resources
        this.invalidate()
        this.logger.debug(
            `SMUS Connection: Successfully disposed connection credentials provider for connection ${this.connectionId}`
        )
    }
}
