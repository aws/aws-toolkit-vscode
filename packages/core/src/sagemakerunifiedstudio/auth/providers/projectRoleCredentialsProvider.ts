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
import { loadMappings, saveMappings } from '../../../awsService/sagemaker/credentialMapping'

/**
 * Credentials provider for SageMaker Unified Studio Project Role credentials
 * Uses Domain Execution Role (DER) credentials to get project-scoped credentials
 * via the DataZone GetEnvironmentCredentials API
 *
 * This provider implements independent caching with 10-minute expiry and can be used
 * with any AWS SDK client (S3Client, LambdaClient, etc.)
 */
export class ProjectRoleCredentialsProvider implements CredentialsProvider {
    private readonly logger = getLogger()
    private credentialCache?: {
        credentials: AWS.Credentials
        expiresAt: Date
    }

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
        this.logger.debug(`SMUS Project: Getting credentials for project ${this.projectId}`)

        // Check cache first (10-minute expiry)
        if (this.credentialCache && this.credentialCache.expiresAt > new Date()) {
            this.logger.debug(`SMUS Project: Using cached project credentials for project ${this.projectId}`)
            return this.credentialCache.credentials
        }

        this.logger.debug(`SMUS Project: Fetching project credentials from API for project ${this.projectId}`)

        try {
            const dataZoneClient = await DataZoneClient.getInstance(this.smusAuthProvider)
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
            this.logger.error(
                'SMUS Project: Failed to get project credentials for project %s: %s',
                this.projectId,
                (err as Error).message
            )
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
            this.logger.warn('SMUS Project: Failed to write project credentials to mapping file: %s', err)
        }
    }

    /**
     * Invalidates cached project credentials
     * Clears the internal cache without fetching new credentials
     */
    public invalidate(): void {
        this.logger.debug(`SMUS Project: Invalidating cached credentials for project ${this.projectId}`)
        // Clear cache to force fresh fetch on next getCredentials() call
        this.credentialCache = undefined
        this.logger.debug(
            `SMUS Project: Successfully invalidated project credentials cache for project ${this.projectId}`
        )
    }
}
