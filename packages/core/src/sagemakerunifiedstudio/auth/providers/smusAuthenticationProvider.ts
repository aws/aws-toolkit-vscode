/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { Auth } from '../../../auth/auth'
import { getSecondaryAuth } from '../../../auth/secondaryAuth'
import { ToolkitError } from '../../../shared/errors'
import { withTelemetryContext } from '../../../shared/telemetry/util'
import { SsoConnection } from '../../../auth/connection'
import { showReauthenticateMessage } from '../../../shared/utilities/messages'
import * as localizedText from '../../../shared/localizedText'
import { ToolkitPromptSettings } from '../../../shared/settings'
import { setContext, getContext } from '../../../shared/vscode/setContext'
import { getLogger } from '../../../shared/logger/logger'
import { SmusUtils, SmusErrorCodes, extractAccountIdFromSageMakerArn } from '../../shared/smusUtils'
import { createSmusProfile, isValidSmusConnection, SmusConnection } from '../model'
import { DomainExecRoleCredentialsProvider } from './domainExecRoleCredentialsProvider'
import { ProjectRoleCredentialsProvider } from './projectRoleCredentialsProvider'
import { ConnectionCredentialsProvider } from './connectionCredentialsProvider'
import { ConnectionClientStore } from '../../shared/client/connectionClientStore'
import { getResourceMetadata } from '../../shared/utils/resourceMetadataUtils'
import { fromIni } from '@aws-sdk/credential-providers'
import { randomUUID } from '../../../shared/crypto'
import { DefaultStsClient } from '../../../shared/clients/stsClient'
import { DataZoneClient } from '../../shared/client/datazoneClient'

/**
 * Sets the context variable for SageMaker Unified Studio connection state
 * @param isConnected Whether SMUS is connected
 */
export function setSmusConnectedContext(isConnected: boolean): Promise<void> {
    return setContext('aws.smus.connected', isConnected)
}

/**
 * Sets the context variable for SMUS space environment state
 * @param inSmusSpace Whether we're in SMUS space environment
 */
export function setSmusSpaceEnvironmentContext(inSmusSpace: boolean): Promise<void> {
    return setContext('aws.smus.inSmusSpaceEnvironment', inSmusSpace)
}
const authClassName = 'SmusAuthenticationProvider'

/**
 * Authentication provider for SageMaker Unified Studio
 * Manages authentication state and credentials for SMUS
 */
export class SmusAuthenticationProvider {
    private readonly logger = getLogger()
    public readonly onDidChangeActiveConnection = this.secondaryAuth.onDidChangeActiveConnection
    private readonly onDidChangeEmitter = new vscode.EventEmitter<void>()
    public readonly onDidChange = this.onDidChangeEmitter.event
    private credentialsProviderCache = new Map<string, any>()
    private projectCredentialProvidersCache = new Map<string, ProjectRoleCredentialsProvider>()
    private connectionCredentialProvidersCache = new Map<string, ConnectionCredentialsProvider>()
    private cachedDomainAccountId: string | undefined
    private cachedProjectAccountIds = new Map<string, string>()

    public constructor(
        public readonly auth = Auth.instance,
        public readonly secondaryAuth = getSecondaryAuth(
            auth,
            'smus',
            'SageMaker Unified Studio',
            isValidSmusConnection
        )
    ) {
        this.onDidChangeActiveConnection(async () => {
            // Stop SSH credential refresh for all projects when connection changes
            this.stopAllSshCredentialRefresh()

            // Invalidate any cached credentials for the previous connection
            await this.invalidateAllCredentialsInCache()
            // Clear credentials provider cache when connection changes
            this.credentialsProviderCache.clear()
            // Clear project provider cache when connection changes
            this.projectCredentialProvidersCache.clear()
            // Clear connection provider cache when connection changes
            this.connectionCredentialProvidersCache.clear()
            // Clear cached domain account ID when connection changes
            this.cachedDomainAccountId = undefined
            // Clear cached project account IDs when connection changes
            this.cachedProjectAccountIds.clear()
            // Clear all clients in client store when connection changes
            ConnectionClientStore.getInstance().clearAll()
            await setSmusConnectedContext(this.isConnected())
            await setSmusSpaceEnvironmentContext(SmusUtils.isInSmusSpaceEnvironment())
            this.onDidChangeEmitter.fire()
        })

        // Set initial context in case event does not trigger
        void setSmusConnectedContext(this.isConnectionValid())
        void setSmusSpaceEnvironmentContext(SmusUtils.isInSmusSpaceEnvironment())
    }

    /**
     * Stops SSH credential refresh for all projects
     * Called when SMUS connection changes or extension deactivates
     */
    public stopAllSshCredentialRefresh(): void {
        this.logger.debug('SMUS Auth: Stopping SSH credential refresh for all projects')
        for (const provider of this.projectCredentialProvidersCache.values()) {
            provider.stopProactiveCredentialRefresh()
        }
    }

    /**
     * Gets the active connection
     */
    public get activeConnection() {
        if (getContext('aws.smus.inSmusSpaceEnvironment')) {
            const resourceMetadata = getResourceMetadata()!
            if (resourceMetadata.AdditionalMetadata!.DataZoneDomainRegion) {
                return {
                    domainId: resourceMetadata.AdditionalMetadata!.DataZoneDomainId!,
                    ssoRegion: resourceMetadata.AdditionalMetadata!.DataZoneDomainRegion!,
                    // The following fields won't be needed in SMUS space environment
                    // Craft the domain url with known information
                    // Use randome id as placeholder
                    domainUrl: `https://${resourceMetadata.AdditionalMetadata!.DataZoneDomainId!}.sagemaker.${resourceMetadata.AdditionalMetadata!.DataZoneDomainRegion!}.on.aws/`,
                    id: randomUUID(),
                }
            } else {
                throw new ToolkitError('Domain region not found in metadata file.')
            }
        }
        return this.secondaryAuth.activeConnection
    }

    /**
     * Checks if using a saved connection
     */
    public get isUsingSavedConnection() {
        return this.secondaryAuth.hasSavedConnection
    }

    /**
     * Checks if the connection is valid
     */
    public isConnectionValid(): boolean {
        // When in SMUS space, the extension is already running in projet context and sign in is not needed
        // Set isConnectionValid to always true
        if (getContext('aws.smus.inSmusSpaceEnvironment')) {
            return true
        }
        return this.activeConnection !== undefined && !this.secondaryAuth.isConnectionExpired
    }

    /**
     * Checks if connected to SMUS
     */
    public isConnected(): boolean {
        // When in SMUS space, the extension is already running in projet context and sign in is not needed
        // Set isConnected to always true
        if (getContext('aws.smus.inSmusSpaceEnvironment')) {
            return true
        }
        return this.activeConnection !== undefined
    }

    /**
     * Restores the previous connection
     * Uses a promise to prevent multiple simultaneous restore calls
     */
    public async restore() {
        await this.secondaryAuth.restoreConnection()
    }

    /**
     * Authenticates with SageMaker Unified Studio using a domain URL
     * @param domainUrl The SageMaker Unified Studio domain URL
     * @returns Promise resolving to the connection
     */
    @withTelemetryContext({ name: 'connectToSmus', class: authClassName })
    public async connectToSmus(domainUrl: string): Promise<SmusConnection> {
        const logger = getLogger()

        try {
            // Extract domain info using SmusUtils
            const { domainId, region } = SmusUtils.extractDomainInfoFromUrl(domainUrl)

            // Validate domain ID
            if (!domainId) {
                throw new ToolkitError('Invalid domain URL format', { code: 'InvalidDomainUrl' })
            }

            logger.info(`SMUS: Connecting to domain ${domainId} in region ${region}`)

            // Check if we already have a connection for this domain
            const existingConn = (await this.auth.listConnections()).find(
                (c): c is SmusConnection =>
                    isValidSmusConnection(c) && (c as any).domainUrl?.toLowerCase() === domainUrl.toLowerCase()
            )

            if (existingConn) {
                const connectionState = this.auth.getConnectionState(existingConn)
                logger.info(`SMUS: Found existing connection ${existingConn.id} with state: ${connectionState}`)

                // If connection is valid, use it directly without triggering new auth flow
                if (connectionState === 'valid') {
                    logger.info('SMUS: Using existing valid connection')

                    // Use the existing connection
                    const result = await this.secondaryAuth.useNewConnection(existingConn)

                    // Auto-invoke project selection after successful sign-in (but not in SMUS space environment)
                    if (!SmusUtils.isInSmusSpaceEnvironment()) {
                        void vscode.commands.executeCommand('aws.smus.switchProject')
                    }

                    return result
                }

                // If connection is invalid or expired, reauthenticate
                if (connectionState === 'invalid') {
                    logger.info('SMUS: Existing connection is invalid, reauthenticating')
                    const reauthenticatedConn = await this.reauthenticate(existingConn)

                    // Create the SMUS connection wrapper
                    const smusConn: SmusConnection = {
                        ...reauthenticatedConn,
                        domainUrl,
                        domainId,
                    }

                    const result = await this.secondaryAuth.useNewConnection(smusConn)
                    logger.debug(`SMUS: Reauthenticated connection successfully, id=${result.id}`)

                    // Auto-invoke project selection after successful reauthentication (but not in SMUS space environment)
                    if (!SmusUtils.isInSmusSpaceEnvironment()) {
                        void vscode.commands.executeCommand('aws.smus.switchProject')
                    }

                    return result
                }
            }

            // No existing connection found, create a new one
            logger.info('SMUS: No existing connection found, creating new connection')

            // Get SSO instance info from DataZone
            const ssoInstanceInfo = await SmusUtils.getSsoInstanceInfo(domainUrl)

            // Create a new connection with appropriate scope based on domain URL
            const profile = createSmusProfile(domainUrl, domainId, ssoInstanceInfo.issuerUrl, ssoInstanceInfo.region)
            const newConn = await this.auth.createConnection(profile)
            logger.debug(`SMUS: Created new connection ${newConn.id}`)

            const smusConn: SmusConnection = {
                ...newConn,
                domainUrl,
                domainId,
            }

            const result = await this.secondaryAuth.useNewConnection(smusConn)

            // Auto-invoke project selection after successful sign-in (but not in SMUS space environment)
            if (!SmusUtils.isInSmusSpaceEnvironment()) {
                void vscode.commands.executeCommand('aws.smus.switchProject')
            }

            return result
        } catch (e) {
            throw ToolkitError.chain(e, 'Failed to connect to SageMaker Unified Studio', {
                code: 'FailedToConnect',
            })
        }
    }

    /**
     * Reauthenticates an existing connection
     * @param conn Connection to reauthenticate
     * @returns Promise resolving to the reauthenticated connection
     */
    @withTelemetryContext({ name: 'reauthenticate', class: authClassName })
    public async reauthenticate(conn: SsoConnection) {
        try {
            return await this.auth.reauthenticate(conn)
        } catch (err) {
            throw ToolkitError.chain(err, 'Unable to reauthenticate SageMaker Unified Studio connection.')
        }
    }

    /**
     * Shows a reauthentication prompt to the user
     * @param conn Connection to reauthenticate
     */
    public async showReauthenticationPrompt(conn: SsoConnection): Promise<void> {
        await showReauthenticateMessage({
            message: localizedText.connectionExpired('SageMaker Unified Studio'),
            connect: localizedText.reauthenticate,
            suppressId: 'smusConnectionExpired',
            settings: ToolkitPromptSettings.instance,
            source: 'SageMaker Unified Studio',
            reauthFunc: async () => {
                await this.reauthenticate(conn)
            },
        })
    }

    /**
     * Gets the current SSO access token for the active connection
     * @returns Promise resolving to the access token string
     * @throws ToolkitError if unable to retrieve access token
     */
    public async getAccessToken(): Promise<string> {
        const logger = getLogger()

        if (!this.activeConnection) {
            throw new ToolkitError('No active SMUS connection available', { code: SmusErrorCodes.NoActiveConnection })
        }

        try {
            const accessToken = await this.auth.getSsoAccessToken(this.activeConnection)
            logger.debug(`SMUS: Successfully retrieved SSO access token for connection ${this.activeConnection.id}`)

            return accessToken
        } catch (err) {
            logger.error(
                `SMUS: Failed to retrieve SSO access token for connection ${this.activeConnection.id}: %s`,
                err
            )

            // Check if this is a reauth error that should be handled by showing SMUS-specific prompt
            if (err instanceof ToolkitError && err.code === 'InvalidConnection') {
                // Re-throw the error to maintain the error flow
                logger.debug(
                    `SMUS: Auth connection has been marked invalid - Likely due to expiry. Reauthentication flow will be triggered, ignoring error`
                )
            }

            throw new ToolkitError(`Failed to retrieve SSO access token for connection ${this.activeConnection.id}`, {
                code: SmusErrorCodes.RedeemAccessTokenFailed,
                cause: err instanceof Error ? err : undefined,
            })
        }
    }

    /**
     * Gets or creates a project credentials provider for the specified project
     * @param projectId The project ID to get credentials for
     * @returns Promise resolving to the project credentials provider
     */
    public async getProjectCredentialProvider(projectId: string): Promise<ProjectRoleCredentialsProvider> {
        const logger = getLogger()

        if (!this.activeConnection) {
            throw new ToolkitError('No active SMUS connection available', { code: SmusErrorCodes.NoActiveConnection })
        }

        logger.debug(`SMUS: Getting project provider for project ${projectId}`)

        // Check if we already have a cached provider for this project
        if (this.projectCredentialProvidersCache.has(projectId)) {
            logger.debug('SMUS: Using cached project provider')
            return this.projectCredentialProvidersCache.get(projectId)!
        }

        logger.debug('SMUS: Creating new project provider')
        // Create a new project provider and cache it
        const projectProvider = new ProjectRoleCredentialsProvider(this, projectId)
        this.projectCredentialProvidersCache.set(projectId, projectProvider)

        logger.debug('SMUS: Cached new project provider')

        return projectProvider
    }

    /**
     * Gets or creates a connection credentials provider for the specified connection
     * @param connectionId The connection ID to get credentials for
     * @param projectId The project ID that owns the connection
     * @param region The region for the connection
     * @returns Promise resolving to the connection credentials provider
     */
    public async getConnectionCredentialsProvider(
        connectionId: string,
        projectId: string,
        region: string
    ): Promise<ConnectionCredentialsProvider> {
        const logger = getLogger()

        if (!this.activeConnection) {
            throw new ToolkitError('No active SMUS connection available', { code: SmusErrorCodes.NoActiveConnection })
        }

        const cacheKey = `${this.activeConnection.domainId}:${projectId}:${connectionId}`
        logger.debug(`SMUS: Getting connection provider for connection ${connectionId}`)

        // Check if we already have a cached provider for this connection
        if (this.connectionCredentialProvidersCache.has(cacheKey)) {
            logger.debug('SMUS: Using cached connection provider')
            return this.connectionCredentialProvidersCache.get(cacheKey)!
        }

        logger.debug('SMUS: Creating new connection provider')
        // Create a new connection provider and cache it
        const connectionProvider = new ConnectionCredentialsProvider(this, connectionId)
        this.connectionCredentialProvidersCache.set(cacheKey, connectionProvider)

        logger.debug('SMUS: Cached new connection provider')

        return connectionProvider
    }

    /**
     * Gets the domain ID from the active connection
     * @returns Domain ID
     */
    public getDomainId(): string {
        if (getContext('aws.smus.inSmusSpaceEnvironment')) {
            return getResourceMetadata()!.AdditionalMetadata!.DataZoneDomainId!
        }

        if (!this.activeConnection) {
            throw new ToolkitError('No active SMUS connection available', { code: SmusErrorCodes.NoActiveConnection })
        }
        return this.activeConnection.domainId
    }

    /**
     * Gets the domain URL from the active connection
     * @returns Domain URL
     */
    public getDomainUrl(): string {
        if (!this.activeConnection) {
            throw new ToolkitError('No active SMUS connection available', { code: SmusErrorCodes.NoActiveConnection })
        }
        return this.activeConnection.domainUrl
    }

    /**
     * Extracts account ID from ResourceArn in SMUS space environment
     * @returns Promise resolving to the account ID
     * @throws ToolkitError if unable to extract account ID
     */
    private async extractAccountIdFromResourceMetadata(): Promise<string> {
        const logger = getLogger()

        try {
            logger.debug('SMUS: Extracting account ID from ResourceArn in resource-metadata file')

            const resourceMetadata = getResourceMetadata()!
            const resourceArn = resourceMetadata.ResourceArn

            if (!resourceArn) {
                throw new Error('ResourceArn not found in metadata file')
            }

            const accountId = extractAccountIdFromSageMakerArn(resourceArn)
            logger.debug(`Successfully extracted account ID from resource-metadata file: ${accountId}`)

            return accountId
        } catch (err) {
            logger.error(`Failed to extract account ID from ResourceArn: %s`, err)
            throw new Error('Failed to extract AWS account ID from ResourceArn in SMUS space environment')
        }
    }

    /**
     * Gets the AWS account ID for the active domain connection
     * In SMUS space environment, extracts from ResourceArn in metadata
     * Otherwise, makes an STS GetCallerIdentity call using DER credentials and caches the result
     * @returns Promise resolving to the domain's AWS account ID
     * @throws ToolkitError if unable to retrieve account ID
     */
    public async getDomainAccountId(): Promise<string> {
        const logger = getLogger()

        // Return cached value if available
        if (this.cachedDomainAccountId) {
            logger.debug('SMUS: Using cached domain account ID')
            return this.cachedDomainAccountId
        }

        // If in SMUS space environment, extract account ID from resource-metadata file
        if (getContext('aws.smus.inSmusSpaceEnvironment')) {
            const accountId = await this.extractAccountIdFromResourceMetadata()

            // Cache the account ID
            this.cachedDomainAccountId = accountId
            logger.debug(`Successfully cached domain account ID: ${accountId}`)

            return accountId
        }

        if (!this.activeConnection) {
            throw new ToolkitError('No active SMUS connection available', { code: SmusErrorCodes.NoActiveConnection })
        }

        // Use existing STS GetCallerIdentity implementation for non-SMUS space environments
        try {
            logger.debug('Fetching domain account ID via STS GetCallerIdentity')

            // Get DER credentials provider
            const derCredProvider = await this.getDerCredentialsProvider()

            // Get the region for STS client
            const region = this.getDomainRegion()

            // Create STS client with DER credentials
            const stsClient = new DefaultStsClient(region, await derCredProvider.getCredentials())

            // Make GetCallerIdentity call
            const callerIdentity = await stsClient.getCallerIdentity()

            if (!callerIdentity.Account) {
                throw new ToolkitError('Account ID not found in STS GetCallerIdentity response', {
                    code: SmusErrorCodes.AccountIdNotFound,
                })
            }

            // Cache the account ID
            this.cachedDomainAccountId = callerIdentity.Account

            logger.debug(`Successfully retrieved and cached domain account ID: ${callerIdentity.Account}`)

            return callerIdentity.Account
        } catch (err) {
            logger.error(`Failed to retrieve domain account ID: %s`, err)

            throw new ToolkitError('Failed to retrieve AWS account ID for active domain connection', {
                code: SmusErrorCodes.GetDomainAccountIdFailed,
                cause: err instanceof Error ? err : undefined,
            })
        }
    }

    /**
     * Gets the AWS account ID for a specific project using project credentials
     * In SMUS space environment, extracts from ResourceArn in metadata (same as domain account)
     * Otherwise, makes an STS GetCallerIdentity call using project credentials
     * @param projectId The DataZone project ID
     * @returns Promise resolving to the project's AWS account ID
     */
    public async getProjectAccountId(projectId: string): Promise<string> {
        const logger = getLogger()

        // Return cached value if available
        if (this.cachedProjectAccountIds.has(projectId)) {
            logger.debug(`SMUS: Using cached project account ID for project ${projectId}`)
            return this.cachedProjectAccountIds.get(projectId)!
        }

        // If in SMUS space environment, extract account ID from resource-metadata file
        if (getContext('aws.smus.inSmusSpaceEnvironment')) {
            const accountId = await this.extractAccountIdFromResourceMetadata()

            // Cache the account ID
            this.cachedProjectAccountIds.set(projectId, accountId)
            logger.debug(`Successfully cached project account ID for project ${projectId}: ${accountId}`)

            return accountId
        }

        if (!this.activeConnection) {
            throw new ToolkitError('No active SMUS connection available', { code: SmusErrorCodes.NoActiveConnection })
        }

        // For non-SMUS space environments, use project credentials with STS
        try {
            logger.debug('Fetching project account ID via STS GetCallerIdentity with project credentials')

            // Get project credentials
            const projectCredProvider = await this.getProjectCredentialProvider(projectId)
            const projectCreds = await projectCredProvider.getCredentials()

            // Get project region from tooling environment
            const dzClient = await DataZoneClient.getInstance(this)
            const toolingEnv = await dzClient.getToolingEnvironment(projectId)
            const projectRegion = toolingEnv.awsAccountRegion

            if (!projectRegion) {
                throw new ToolkitError('No AWS account region found in tooling environment', {
                    code: SmusErrorCodes.RegionNotFound,
                })
            }

            // Use STS to get account ID from project credentials
            const stsClient = new DefaultStsClient(projectRegion, projectCreds)
            const callerIdentity = await stsClient.getCallerIdentity()

            if (!callerIdentity.Account) {
                throw new ToolkitError('Account ID not found in STS GetCallerIdentity response', {
                    code: SmusErrorCodes.AccountIdNotFound,
                })
            }

            // Cache the account ID
            this.cachedProjectAccountIds.set(projectId, callerIdentity.Account)
            logger.debug(
                `Successfully retrieved and cached project account ID for project ${projectId}: ${callerIdentity.Account}`
            )

            return callerIdentity.Account
        } catch (err) {
            logger.error('Failed to get project account ID: %s', err as Error)
            throw new ToolkitError(`Failed to get project account ID: ${(err as Error).message}`, {
                code: SmusErrorCodes.GetProjectAccountIdFailed,
            })
        }
    }

    public getDomainRegion(): string {
        if (getContext('aws.smus.inSmusSpaceEnvironment')) {
            const resourceMetadata = getResourceMetadata()!
            if (resourceMetadata.AdditionalMetadata!.DataZoneDomainRegion) {
                return resourceMetadata.AdditionalMetadata!.DataZoneDomainRegion
            } else {
                throw new ToolkitError('Domain region not found in metadata file.')
            }
        }

        if (!this.activeConnection) {
            throw new ToolkitError('No active SMUS connection available', { code: SmusErrorCodes.NoActiveConnection })
        }
        return this.activeConnection.ssoRegion
    }

    /**
     * Gets or creates a cached credentials provider for the active connection
     * @returns Promise resolving to the credentials provider
     */
    public async getDerCredentialsProvider(): Promise<any> {
        const logger = getLogger()

        if (getContext('aws.smus.inSmusSpaceEnvironment')) {
            // When in SMUS space, DomainExecutionRoleCreds can be found in config file
            // Read the credentials from credential profile DomainExecutionRoleCreds
            const credentials = fromIni({ profile: 'DomainExecutionRoleCreds' })
            return {
                getCredentials: async () => await credentials(),
            }
        }

        if (!this.activeConnection) {
            throw new ToolkitError('No active SMUS connection available', { code: SmusErrorCodes.NoActiveConnection })
        }

        // Create a cache key based on the connection details
        const cacheKey = `${this.activeConnection.ssoRegion}:${this.activeConnection.domainId}`

        logger.debug(`SMUS: Getting credentials provider for cache key: ${cacheKey}`)

        // Check if we already have a cached provider
        if (this.credentialsProviderCache.has(cacheKey)) {
            logger.debug('SMUS: Using cached credentials provider')
            return this.credentialsProviderCache.get(cacheKey)
        }

        logger.debug('SMUS: Creating new credentials provider')

        // Create a new provider and cache it
        const provider = new DomainExecRoleCredentialsProvider(
            this.activeConnection.domainUrl,
            this.activeConnection.domainId,
            this.activeConnection.ssoRegion,
            async () => await this.getAccessToken()
        )

        this.credentialsProviderCache.set(cacheKey, provider)
        logger.debug('SMUS: Cached new credentials provider')

        return provider
    }

    /**
     * Invalidates all cached credentials (for all connections)
     * Used during connection changes or logout
     */
    private async invalidateAllCredentialsInCache(): Promise<void> {
        const logger = getLogger()
        logger.debug('SMUS: Invalidating all cached credentials')

        // Clear all cached DER providers and their internal credentials
        for (const [cacheKey, provider] of this.credentialsProviderCache.entries()) {
            try {
                provider.invalidate() // This will clear the provider's internal cache
                logger.debug(`SMUS: Invalidated credentials for cache key: ${cacheKey}`)
            } catch (err) {
                logger.warn(`SMUS: Failed to invalidate credentials for cache key ${cacheKey}: %s`, err)
            }
        }

        // Clear all cached project providers and their internal credentials

        await this.invalidateAllProjectCredentialsInCache()
        // Clear all cached connection providers and their internal credentials
        for (const [cacheKey, connectionProvider] of this.connectionCredentialProvidersCache.entries()) {
            try {
                connectionProvider.invalidate() // This will clear the connection provider's internal cache
                logger.debug(`SMUS: Invalidated connection credentials for cache key: ${cacheKey}`)
            } catch (err) {
                logger.warn(`SMUS: Failed to invalidate connection credentials for cache key ${cacheKey}: %s`, err)
            }
        }

        // Clear cached domain account ID
        this.cachedDomainAccountId = undefined
        logger.debug('SMUS: Cleared cached domain account ID')

        // Clear cached project account IDs
        this.cachedProjectAccountIds.clear()
        logger.debug('SMUS: Cleared cached project account IDs')
    }

    /**
     * Invalidates all project cached credentials
     */
    public async invalidateAllProjectCredentialsInCache(): Promise<void> {
        const logger = getLogger()
        logger.debug('SMUS: Invalidating all cached project credentials')

        for (const [projectId, projectProvider] of this.projectCredentialProvidersCache.entries()) {
            try {
                projectProvider.invalidate() // This will clear the project provider's internal cache
                logger.debug(`SMUS: Invalidated project credentials for project: ${projectId}`)
            } catch (err) {
                logger.warn(`SMUS: Failed to invalidate project credentials for project ${projectId}: %s`, err)
            }
        }
    }

    /**
     * Stops SSH credential refresh and cleans up resources
     */
    public dispose(): void {
        this.logger.debug('SMUS Auth: Disposing authentication provider and all cached providers')

        // Dispose all project providers
        for (const provider of this.projectCredentialProvidersCache.values()) {
            provider.dispose()
        }
        this.projectCredentialProvidersCache.clear()

        // Dispose all connection providers
        for (const provider of this.connectionCredentialProvidersCache.values()) {
            provider.dispose()
        }
        this.connectionCredentialProvidersCache.clear()

        // Dispose all DER providers in the general cache
        for (const provider of this.credentialsProviderCache.values()) {
            if (provider && typeof provider.dispose === 'function') {
                provider.dispose()
            }
        }
        this.credentialsProviderCache.clear()

        // Clear cached domain account ID
        this.cachedDomainAccountId = undefined

        // Clear cached project account IDs
        this.cachedProjectAccountIds.clear()

        this.logger.debug('SMUS Auth: Successfully disposed authentication provider')
    }

    static #instance: SmusAuthenticationProvider | undefined

    public static get instance(): SmusAuthenticationProvider | undefined {
        return SmusAuthenticationProvider.#instance
    }

    public static fromContext() {
        return (this.#instance ??= new this())
    }
}
