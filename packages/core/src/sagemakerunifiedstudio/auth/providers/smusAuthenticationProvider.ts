/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AwsCredentialIdentity } from '@aws-sdk/types'
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
import {
    SmusUtils,
    SmusErrorCodes,
    extractAccountIdFromResourceMetadata,
    convertToToolkitCredentialProvider,
    isIamDomain,
} from '../../shared/smusUtils'
import {
    createSmusProfile,
    isValidSmusConnection,
    SmusConnection,
    SmusIamConnection,
    isSmusSsoConnection,
    isSmusIamConnection,
} from '../model'
import { IamCredentialExpiryAction, showIamCredentialExpiryOptions } from '../credentialExpiryHandler'

import { DomainExecRoleCredentialsProvider } from './domainExecRoleCredentialsProvider'
import { ProjectRoleCredentialsProvider } from './projectRoleCredentialsProvider'
import { ConnectionCredentialsProvider } from './connectionCredentialsProvider'
import { ConnectionClientStore } from '../../shared/client/connectionClientStore'
import { getResourceMetadata } from '../../shared/utils/resourceMetadataUtils'
import { CredentialsProviderManager } from '../../../auth/providers/credentialsProviderManager'
import { SharedCredentialsProvider } from '../../../auth/providers/sharedCredentialsProvider'
import { CredentialsId, CredentialsProvider } from '../../../auth/providers/credentials'
import globals from '../../../shared/extensionGlobals'
import { fromContainerMetadata, fromIni, fromNodeProviderChain } from '@aws-sdk/credential-providers'
import { randomUUID } from '../../../shared/crypto'
import { DefaultStsClient } from '../../../shared/clients/stsClient'
import { DataZoneCustomClientHelper } from '../../shared/client/datazoneCustomClientHelper'
import { createDZClientBaseOnDomainMode } from '../../explorer/nodes/utils'
import { DataZoneClient } from '../../shared/client/datazoneClient'
import { loadSharedConfigFiles } from '@smithy/shared-ini-file-loader'
import { loadSharedCredentialsProfiles } from '../../../auth/credentials/sharedCredentials'

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

/**
 * Sets the context variable for SMUS IAM mode state
 * @param isIamMode Whether the current domain is in IAM mode
 */
export function setSmusIamModeContext(isIamMode: boolean): Promise<void> {
    return setContext('aws.smus.isIamMode', isIamMode)
}
const authClassName = 'SmusAuthenticationProvider'

/**
 * Authentication provider for SageMaker Unified Studio
 * Manages authentication state and credentials for SMUS
 */
export class SmusAuthenticationProvider {
    private readonly logger = getLogger('smus')
    public readonly onDidChangeActiveConnection: vscode.Event<SmusConnection | undefined>
    private readonly onDidChangeEmitter = new vscode.EventEmitter<void>()
    public readonly onDidChange = this.onDidChangeEmitter.event
    private credentialsProviderCache = new Map<string, any>()
    private projectCredentialProvidersCache = new Map<string, ProjectRoleCredentialsProvider>()
    private connectionCredentialProvidersCache = new Map<string, ConnectionCredentialsProvider>()
    private cachedDomainAccountId: string | undefined
    private cachedProjectAccountIds = new Map<string, string>()
    private iamCallerIdentityCache: { arn: string; connectionId: string } | undefined

    public readonly secondaryAuth: ReturnType<typeof getSecondaryAuth>

    public constructor(public readonly auth = Auth.instance) {
        // Create secondaryAuth after the class is constructed so we can reference instance methods
        this.secondaryAuth = getSecondaryAuth(
            auth,
            'smus',
            'SageMaker Unified Studio',
            (conn): conn is SmusConnection => {
                // Use auth's state directly since secondaryAuth isn't available yet during initialization
                const state = auth.getStateMemento()
                const smusConnections = state.get('smus.connections') as any
                const savedConnectionId = state.get('smus.savedConnectionId') as string

                // Only accept IAM connections that are currently saved for SMUS
                if (conn && conn.type === 'iam') {
                    // Must be the exact connection that SMUS has saved AND have metadata
                    return (
                        conn.id === savedConnectionId &&
                        smusConnections &&
                        smusConnections[conn.id] &&
                        isValidSmusConnection(conn, smusConnections[conn.id])
                    )
                }

                // SSO connections: Check if they have SMUS scope (always SMUS-specific)
                if (conn && conn.type === 'sso') {
                    return isValidSmusConnection(conn) // Checks for SMUS scope
                }

                // Reject everything else
                return false
            }
        )

        // Initialize the event property
        this.onDidChangeActiveConnection = this.secondaryAuth.onDidChangeActiveConnection as vscode.Event<
            SmusConnection | undefined
        >

        // Set up event listeners
        this.secondaryAuth.onDidChangeActiveConnection(async () => {
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
            // Clear cached IAM caller identity when connection changes
            this.clearIamCallerIdentityCache()
            // Clear all clients in client store when connection changes
            ConnectionClientStore.getInstance().clearAll()
            await setSmusConnectedContext(this.isConnected())
            await setSmusSpaceEnvironmentContext(SmusUtils.isInSmusSpaceEnvironment())

            // Set IAM mode context based on connection metadata
            const activeConn = this.activeConnection
            if (activeConn && 'type' in activeConn && activeConn.type === 'iam') {
                const smusConnections = (this.secondaryAuth.state.get('smus.connections') as any) || {}
                const connectionMetadata = smusConnections[activeConn.id]
                const isIamDomain = connectionMetadata?.isIamDomain || false
                await setSmusIamModeContext(isIamDomain)
            } else {
                // Clear IAM mode context for non-IAM connections or no connection
                await setSmusIamModeContext(false)
            }
            // Update IAM mode context in SMUS space environment
            if (getContext('aws.smus.inSmusSpaceEnvironment')) {
                await this.initIamModeContextInSpaceEnvironment()
            }

            this.onDidChangeEmitter.fire()
        })

        // Set initial context in case event does not trigger
        void setSmusConnectedContext(this.isConnectionValid())
        void setSmusSpaceEnvironmentContext(SmusUtils.isInSmusSpaceEnvironment())

        // Set initial IAM mode context
        void (async () => {
            // Update IAM mode context in SMUS space environment
            if (getContext('aws.smus.inSmusSpaceEnvironment')) {
                await this.initIamModeContextInSpaceEnvironment()
            } else {
                const activeConn = this.activeConnection
                if (activeConn && 'type' in activeConn && activeConn.type === 'iam') {
                    const state = this.auth.getStateMemento()
                    const smusConnections = (state.get('smus.connections') as any) || {}
                    const connectionMetadata = smusConnections[activeConn.id]
                    const isIamDomain = connectionMetadata?.isIamDomain || false
                    await setSmusIamModeContext(isIamDomain)
                } else {
                    await setSmusIamModeContext(false)
                }
            }
        })()
    }

    /**
     * Initializes IAM mode context in SMUS space environment
     */
    private async initIamModeContextInSpaceEnvironment(): Promise<void> {
        try {
            const resourceMetadata = getResourceMetadata()
            if (
                resourceMetadata?.AdditionalMetadata?.DataZoneDomainId &&
                resourceMetadata?.AdditionalMetadata?.DataZoneDomainRegion
            ) {
                const domainId = resourceMetadata.AdditionalMetadata.DataZoneDomainId
                const region = resourceMetadata.AdditionalMetadata.DataZoneDomainRegion

                const credentialsProvider = (await this.getDerCredentialsProvider()) as CredentialsProvider

                // Get DataZoneCustomClientHelper instance and fetch domain details to check if it's IAM mode
                const datazoneCustomClientHelper = DataZoneCustomClientHelper.getInstance(credentialsProvider, region)
                const domain = await datazoneCustomClientHelper.getDomain(domainId)
                const isIamMode = isIamDomain({
                    domainVersion: domain.domainVersion,
                    iamSignIns: domain.iamSignIns,
                    domainId: domainId,
                })
                this.logger.debug(`Domain ${domainId} is in IAM mode: ${isIamMode}`)
                await setSmusIamModeContext(isIamMode)
            }
        } catch (error) {
            this.logger.error('Failed to check IAM mode in SMUS space environment:  %s', error)
            await setSmusIamModeContext(false)
        }
    }

    /**
     * Stops SSH credential refresh for all projects
     * Called when SMUS connection changes or extension deactivates
     */
    public stopAllSshCredentialRefresh(): void {
        this.logger.debug('Stopping SSH credential refresh for all projects')
        for (const provider of this.projectCredentialProvidersCache.values()) {
            provider.stopProactiveCredentialRefresh()
        }
    }

    /**
     * Gets the active connection
     */
    public get activeConnection(): SmusConnection | undefined {
        if (getContext('aws.smus.inSmusSpaceEnvironment')) {
            const resourceMetadata = getResourceMetadata()!
            if (resourceMetadata.AdditionalMetadata!.DataZoneDomainRegion) {
                // Return a mock connection object for SMUS space environment
                // Include type property based on IAM mode context for telemetry
                // Note: type will be undefined initially until mode is detected
                const isIamMode = getContext('aws.smus.isIamMode')
                return {
                    domainId: resourceMetadata.AdditionalMetadata!.DataZoneDomainId!,
                    ssoRegion: resourceMetadata.AdditionalMetadata!.DataZoneDomainRegion!,
                    domainUrl: `https://${resourceMetadata.AdditionalMetadata!.DataZoneDomainId!}.sagemaker.${resourceMetadata.AdditionalMetadata!.DataZoneDomainRegion!}.on.aws/`,
                    id: randomUUID(),
                    type: isIamMode !== undefined ? (isIamMode ? 'iam' : 'sso') : undefined,
                } as any as SmusConnection
            } else {
                throw new ToolkitError('Domain region not found in metadata file.')
            }
        }
        const baseConnection = this.secondaryAuth.activeConnection

        // If we have a connection, wrap it with SMUS metadata if available
        if (baseConnection) {
            const smusConnections = this.secondaryAuth.state.get('smus.connections') as any
            const connectionMetadata = smusConnections?.[baseConnection.id]

            if (connectionMetadata) {
                // For IAM connections, add the profile-specific metadata
                if (baseConnection.type === 'iam') {
                    return {
                        ...baseConnection,
                        profileName: connectionMetadata.profileName,
                        region: connectionMetadata.region,
                        domainUrl: connectionMetadata.domainUrl,
                        domainId: connectionMetadata.domainId,
                    } as SmusIamConnection
                }
                // For SSO connections, the metadata is already in the connection object
                // but we can ensure consistency by adding any missing properties
                else if (baseConnection.type === 'sso') {
                    return {
                        ...baseConnection,
                        domainUrl: connectionMetadata.domainUrl || (baseConnection as any).domainUrl,
                        domainId: connectionMetadata.domainId || (baseConnection as any).domainId,
                    } as SmusConnection
                }
            }
        }

        return baseConnection as SmusConnection | undefined
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
     * Validates domain metadata against profile and updates if needed before using saved connection
     */
    public async restore() {
        const logger = getLogger('smus')

        // Get the saved connection ID before restoring
        const savedConnectionId = this.secondaryAuth.state.get('smus.savedConnectionId') as string
        if (!savedConnectionId) {
            logger.debug('No saved connection ID found, proceeding with normal restore')
            await this.secondaryAuth.restoreConnection()
            return
        }

        // Get the saved connection metadata
        const smusConnections = (this.secondaryAuth.state.get('smus.connections') as any) || {}
        const connectionMetadata = smusConnections[savedConnectionId]

        // If no connection metadata exists, proceed with normal restore
        if (!connectionMetadata) {
            logger.debug('No connection metadata found, proceeding with normal restore')
            await this.secondaryAuth.restoreConnection()
            return
        }

        const savedProfileName = connectionMetadata.profileName

        // If no profile name in metadata, proceed with normal restore
        if (!savedProfileName) {
            logger.debug('No profile name in metadata, proceeding with normal restore')
            await this.secondaryAuth.restoreConnection()
            return
        }

        const profiles = await loadSharedCredentialsProfiles()
        const profile = profiles[savedProfileName]
        if (!profile) {
            logger.debug(`No profile found with name: ${savedProfileName}`)
            await this.secondaryAuth.restoreConnection()
            return
        }
        const region = profile.region || 'not-set'

        const validation = await this.validateIamProfile(savedProfileName)
        if (!validation.isValid) {
            logger.debug(`Profile validation failed: ${validation.error}, proceeding with normal restore`)
            await this.secondaryAuth.restoreConnection()
            return
        }

        let domainUrl
        try {
            logger.debug(`Finding IAM-based domain in region using profile ${savedProfileName}`)

            // Get DataZoneCustomClientHelper instance
            const datazoneCustomClientHelper = DataZoneCustomClientHelper.getInstance(
                await this.getCredentialsProviderForIamProfile(savedProfileName),
                region
            )

            // Find the IAM-based domain using the client
            const iamDomain = await datazoneCustomClientHelper.getIamDomain()

            if (!iamDomain) {
                logger.warn(`No IAM-based domain found in region ${region}, proceeding with normal restore`)
                await this.secondaryAuth.restoreConnection()
                return
            }

            logger.debug(`Found IAM-based domain: ${iamDomain.name} (${iamDomain.id})`)

            // Construct domain URL from the IAM-based domain
            domainUrl = iamDomain.portalUrl || `https://${iamDomain.id}.sagemaker.${region}.on.aws/`
            logger.debug(`Discovered IAM-based domain URL: ${domainUrl}`)
        } catch (error) {
            logger.error(`Failed to find IAM-based domain: ${error} , proceeding with normal restore`)
            await this.secondaryAuth.restoreConnection()
            return
        }

        try {
            logger.debug(`Validating domain metadata for saved connection ${savedConnectionId}`)

            if (!domainUrl) {
                logger.info('No domain URL constructed, proceeding with normal restore')
                await this.secondaryAuth.restoreConnection()
                return
            }

            const { domainId } = SmusUtils.extractDomainInfoFromUrl(domainUrl)

            // Compare with saved metadata
            const savedDomainId = connectionMetadata.domainId
            const savedRegion = connectionMetadata.region

            if (domainId === savedDomainId && region === savedRegion) {
                logger.debug('Domain metadata matches, proceeding with normal restore')
            } else {
                logger.debug(
                    `SMUS: Domain metadata mismatch detected. Saved: ${savedDomainId}@${savedRegion}, Profile: ${domainId}@${region}. Updating metadata.`
                )

                // Update the metadata with API values
                connectionMetadata.domainId = domainId
                connectionMetadata.region = region

                // Save updated metadata
                smusConnections[savedConnectionId] = connectionMetadata
                await this.secondaryAuth.state.update('smus.connections', smusConnections)

                logger.debug('Successfully updated domain metadata')
            }
        } catch (error) {
            logger.warn(`Failed to validate domain metadata: ${error}. Proceeding with normal restore.`)
        }

        // Proceed with normal restore
        await this.secondaryAuth.restoreConnection()
    }

    /**
     * Signs out from SMUS with different behavior based on connection type:
     * - SSO connections: Deletes the connection (old behavior)
     * - IAM connections: Forgets the connection without affecting the underlying IAM profile
     */
    @withTelemetryContext({ name: 'signOut', class: authClassName })
    public async signOut() {
        const logger = getLogger('smus')

        const activeConnection = this.activeConnection
        if (!activeConnection) {
            logger.debug('No active connection to sign out from')
            return
        }

        const connectionId = activeConnection.id
        logger.info(`Signing out from connection ${connectionId}`)

        try {
            // Clear SMUS-specific metadata from connections registry
            const smusConnections = (this.secondaryAuth.state.get('smus.connections') as any) || {}
            if (smusConnections[connectionId]) {
                delete smusConnections[connectionId]
                await this.secondaryAuth.state.update('smus.connections', smusConnections)
            }

            // Handle sign-out based on connection type
            // Check if this is a real connection (has 'type' property) vs mock connection in SMUS space
            if ('type' in activeConnection && isSmusSsoConnection(activeConnection)) {
                // For SSO connections, delete the connection (old behavior)
                await this.secondaryAuth.deleteConnection()
                logger.info(`Deleted SSO connection ${connectionId}`)
            } else if ('type' in activeConnection) {
                // For IAM connections, forget the connection without affecting the underlying IAM profile
                await this.secondaryAuth.forgetConnection()
                logger.info(`Forgot IAM connection ${connectionId} (preserved for other services)`)

                // Clear IAM mode context for IAM connections
                await setSmusIamModeContext(false)
                logger.debug('Cleared IAM mode context')
            } else {
                // Mock connection in SMUS space environment - no action needed
                logger.info(`Sign out completed for mock connection ${connectionId}`)
            }

            logger.info(`Successfully signed out from connection ${connectionId}`)
        } catch (error) {
            logger.error(`Failed to sign out from connection ${connectionId}:`, error)
            throw new ToolkitError('Failed to sign out from SageMaker Unified Studio', {
                code: SmusErrorCodes.SignOutFailed,
                cause: error instanceof Error ? error : undefined,
            })
        }
    }

    /**
     * Authenticates with SageMaker Unified Studio using SSO and a domain URL
     * @param domainUrl The SageMaker Unified Studio domain URL
     * @returns Promise resolving to the SSO connection
     */
    @withTelemetryContext({ name: 'connectToSmusWithSso', class: authClassName })
    public async connectToSmusWithSso(domainUrl: string): Promise<SmusConnection> {
        const logger = getLogger('smus')

        try {
            // Extract domain info using SmusUtils
            const { domainId, region } = SmusUtils.extractDomainInfoFromUrl(domainUrl)

            // Validate domain ID
            if (!domainId) {
                throw new ToolkitError('Invalid domain URL format', { code: SmusErrorCodes.InvalidDomainUrl })
            }

            logger.info(`Connecting to domain ${domainId} in region ${region}`)

            // Check if we already have a connection for this domain
            const existingConn = (await this.auth.listConnections()).find(
                (c): c is SmusConnection =>
                    isValidSmusConnection(c) && (c as any).domainUrl?.toLowerCase() === domainUrl.toLowerCase()
            )

            if (existingConn) {
                const connectionState = this.auth.getConnectionState(existingConn)
                logger.info(`Found existing connection ${existingConn.id} with state: ${connectionState}`)

                // If connection is valid, use it directly without triggering new auth flow
                if (connectionState === 'valid') {
                    logger.info('Using existing valid connection')

                    // Only SSO connections can be used with connectToSmusWithSso
                    if (isSmusSsoConnection(existingConn)) {
                        // Use the existing SSO connection
                        const result = await this.secondaryAuth.useNewConnection(existingConn)

                        // Auto-invoke project selection after successful sign-in (but not in SMUS space environment)
                        if (!SmusUtils.isInSmusSpaceEnvironment()) {
                            void vscode.commands.executeCommand('aws.smus.switchProject')
                        }

                        return result as SmusConnection
                    }
                }

                // If connection is invalid or expired, handle based on connection type
                if (connectionState === 'invalid') {
                    // Only SSO connections can be reauthenticated
                    if (isSmusSsoConnection(existingConn)) {
                        logger.info('Existing SSO connection is invalid, reauthenticating')
                        const reauthenticatedConn = await this.reauthenticate(existingConn)

                        // Create the SMUS connection wrapper
                        const smusConn: SmusConnection = {
                            ...reauthenticatedConn,
                            domainUrl,
                            domainId,
                        }

                        const result = await this.secondaryAuth.useNewConnection(smusConn)
                        logger.debug(`Reauthenticated connection successfully, id=${result.id}`)

                        // Auto-invoke project selection after successful reauthentication (but not in SMUS space environment)
                        if (!SmusUtils.isInSmusSpaceEnvironment()) {
                            void vscode.commands.executeCommand('aws.smus.switchProject')
                        }

                        return result as SmusConnection
                    }
                }
            }

            // No existing connection found, create a new one
            logger.info('No existing connection found, creating new connection')

            // Get SSO instance info from DataZone
            const ssoInstanceInfo = await SmusUtils.getSsoInstanceInfo(domainUrl)

            // Create a new connection with appropriate scope based on domain URL
            const profile = createSmusProfile(domainUrl, domainId, ssoInstanceInfo.issuerUrl, ssoInstanceInfo.region)
            const newConn = await this.auth.createConnection(profile)
            logger.debug(`Created new connection ${newConn.id}`)

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

            return result as SmusConnection
        } catch (e) {
            throw ToolkitError.chain(e, 'Failed to connect to SageMaker Unified Studio', {
                code: SmusErrorCodes.FailedToConnect,
            })
        }
    }

    /**
     * Authenticates with SageMaker Unified Studio using IAM credential profile
     * @param profileName The AWS credential profile name
     * @param region The AWS region
     * @param domainUrl The SageMaker Unified Studio domain URL
     * @param isIamDomain Whether the domain is an IAM-based domain
     * @returns Promise resolving to the IAM connection
     */
    @withTelemetryContext({ name: 'connectWithIamProfile', class: authClassName })
    public async connectWithIamProfile(
        profileName: string,
        region: string,
        domainUrl: string,
        isIamDomain: boolean = false
    ): Promise<SmusIamConnection> {
        const logger = getLogger('smus')

        try {
            // Extract domain info using SmusUtils
            const { domainId } = SmusUtils.extractDomainInfoFromUrl(domainUrl)

            // Validate domain ID
            if (!domainId) {
                throw new ToolkitError('Invalid domain URL format', { code: SmusErrorCodes.InvalidDomainUrl })
            }

            logger.info(`Connecting with IAM profile ${profileName} to domain ${domainId} in region ${region}`)

            // Note: Credential validation is already done in the orchestrator via validateIamProfile()
            // No need for redundant validation here

            // Check if we already have a basic IAM connection for this profile
            const profileId = `profile:${profileName}`
            const existingConn = await this.auth.getConnection({ id: profileId })

            if (existingConn && existingConn.type === 'iam') {
                logger.info(`Found existing IAM profile connection ${profileId}`)

                // Store SMUS metadata in the connections registry
                const smusConnections = (this.secondaryAuth.state.get('smus.connections') as any) || {}
                smusConnections[existingConn.id] = {
                    profileName,
                    region,
                    domainUrl,
                    domainId,
                    isIamDomain,
                }
                await this.secondaryAuth.state.update('smus.connections', smusConnections)

                // Use the basic IAM connection with secondaryAuth
                await this.secondaryAuth.useNewConnection(existingConn)

                // Ensure the connection state is validated
                await this.auth.refreshConnectionState(existingConn)
                logger.debug(
                    `SMUS: Using existing IAM connection as SMUS connection successfully, id=${existingConn.id}`
                )

                // Set IAM mode context if this is an IAM-based domain
                if (isIamDomain) {
                    await setSmusIamModeContext(true)
                    logger.debug('Set IAM mode context to true')
                }

                // Return a SMUS IAM connection wrapper for the caller
                const smusIamConn: SmusIamConnection = {
                    ...existingConn,
                    profileName,
                    region,
                    domainUrl,
                    domainId,
                }

                return smusIamConn
            }

            // If no existing connection, the auth system should have created one during profile validation
            // This shouldn't happen if credentials are valid, but let's handle it gracefully
            throw new ToolkitError(
                `IAM profile connection not found for '${profileName}'. Please check your AWS credentials configuration.`,
                {
                    code: SmusErrorCodes.ConnectionNotFound,
                }
            )
        } catch (e) {
            throw ToolkitError.chain(e, 'Failed to connect to SageMaker Unified Studio with IAM profile', {
                code: SmusErrorCodes.FailedToConnect,
            })
        }
    }

    /**
     * Validates an IAM credential profile using the existing Toolkit validation infrastructure
     * @param profileName Profile name to validate
     * @returns Promise resolving to validation result
     */
    public async validateIamProfile(profileName: string): Promise<{ isValid: boolean; error?: string }> {
        const logger = getLogger('smus')

        try {
            logger.debug(`Validating IAM profile: ${profileName}`)

            // Create credentials ID for the profile using the existing Toolkit pattern
            const credentialsId: CredentialsId = {
                credentialSource: SharedCredentialsProvider.getProviderType(),
                credentialTypeId: profileName,
            }

            // Get the provider using the existing manager
            const provider = await CredentialsProviderManager.getInstance().getCredentialsProvider(credentialsId)
            if (!provider) {
                return {
                    isValid: false,
                    error: `Profile '${profileName}' not found or not available`,
                }
            }

            // Get credentials and validate using the existing Toolkit validation logic
            // This includes proper telemetry and error handling
            const credentials = await provider.getCredentials()
            await globals.loginManager.validateCredentials(
                credentials,
                provider.getEndpointUrl?.(),
                provider.getDefaultRegion() // Use the region from the profile, not hardcoded
            )

            logger.debug(`Profile validation successful: ${profileName}`)
            return { isValid: true }
        } catch (error) {
            logger.error(`Profile validation failed: ${profileName}`, error)
            return {
                isValid: false,
                error: `Invalid profile '${profileName}' - ${(error as Error).message}`,
            }
        }
    }

    /**
     * Gets credentials for an IAM profile using Toolkit providers
     * @param profileName AWS profile name
     * @returns Promise resolving to credentials
     */
    public async getCredentialsForIamProfile(profileName: string): Promise<AwsCredentialIdentity> {
        const logger = getLogger('smus')

        try {
            logger.debug(`Getting credentials for IAM profile: ${profileName}`)

            // Create credentials ID for the profile using the existing Toolkit pattern
            const credentialsId: CredentialsId = {
                credentialSource: SharedCredentialsProvider.getProviderType(),
                credentialTypeId: profileName,
            }

            // Get the provider using the existing manager
            const provider = await CredentialsProviderManager.getInstance().getCredentialsProvider(credentialsId)
            if (!provider) {
                throw new ToolkitError(`Profile '${profileName}' not found or not available`, {
                    code: SmusErrorCodes.ProfileNotFound,
                })
            }

            // Get credentials using the existing Toolkit provider
            const credentials = await provider.getCredentials()

            logger.debug(`Successfully retrieved credentials for IAM profile: ${profileName}`)
            return credentials
        } catch (error) {
            logger.error(`Failed to get credentials for IAM profile ${profileName}: %s`, error)
            throw new ToolkitError(
                `Failed to get credentials for profile '${profileName}': ${(error as Error).message}`,
                {
                    code: SmusErrorCodes.CredentialRetrievalFailed,
                    cause: error instanceof Error ? error : undefined,
                }
            )
        }
    }

    /**
     * Gets the underlying credentials provider for an IAM profile
     * @param profileName AWS profile name
     * @returns Promise resolving to the credentials provider
     */
    public async getCredentialsProviderForIamProfile(profileName: string): Promise<CredentialsProvider> {
        const logger = getLogger('smus')
        logger.debug(`Getting credentials provider for IAM profile: ${profileName}`)

        // Create credentials ID for the profile using the existing Toolkit pattern
        const credentialsId: CredentialsId = {
            credentialSource: SharedCredentialsProvider.getProviderType(),
            credentialTypeId: profileName,
        }

        // Get the provider using the existing manager
        const provider = await CredentialsProviderManager.getInstance().getCredentialsProvider(credentialsId)
        if (!provider) {
            throw new ToolkitError(`Profile '${profileName}' not found or not available`, {
                code: SmusErrorCodes.ProfileNotFound,
            })
        }

        // Return the underlying provider directly
        // This allows callers to use the provider's full interface including caching and refresh
        return provider
    }

    /**
     * Gets the cached caller identity ARN for the active IAM connection
     * Fetches from STS if not cached or if connection has changed
     * Only works for IAM connections - returns undefined for SSO connections
     * @returns Promise resolving to the ARN, or undefined if not available or not an IAM connection
     */
    public async getCachedIamCallerIdentityArn(): Promise<string | undefined> {
        const logger = getLogger('smus')
        try {
            const activeConn = this.activeConnection
            // Only cache for IAM connections
            if (!activeConn || activeConn.type !== 'iam') {
                return undefined
            }

            // Check if we have a cached ARN for this connection
            if (this.iamCallerIdentityCache && this.iamCallerIdentityCache.connectionId === activeConn.id) {
                logger.debug('Using cached IAM caller identity ARN')
                return this.iamCallerIdentityCache.arn
            }

            // Fetch fresh caller identity
            logger.debug('Fetching IAM caller identity from STS')
            const smusConnections = (this.secondaryAuth.state.get('smus.connections') as any) || {}
            const connectionMetadata = smusConnections[activeConn.id]

            if (!connectionMetadata?.profileName || !connectionMetadata?.region) {
                logger.debug('Missing profile name or region in connection metadata')
                return undefined
            }

            const credentials = await this.getCredentialsForIamProfile(connectionMetadata.profileName)
            const stsClient = new DefaultStsClient(connectionMetadata.region, credentials)
            const callerIdentity = await stsClient.getCallerIdentity()

            if (!callerIdentity.Arn) {
                logger.debug('No ARN found in caller identity')
                return undefined
            }

            // Cache the result
            this.iamCallerIdentityCache = {
                arn: callerIdentity.Arn,
                connectionId: activeConn.id,
            }
            logger.debug(`Cached IAM caller identity ARN for connection ${activeConn.id}`)

            return callerIdentity.Arn
        } catch (error) {
            logger.warn(`Failed to get IAM caller identity: %s`, error)
            return undefined
        }
    }

    /**
     * Gets the session name from the cached IAM caller identity
     * Only works for IAM connections - returns undefined for SSO connections
     * @returns Promise resolving to the session name, or undefined if not available or not an IAM connection
     */
    public async getSessionName(): Promise<string | undefined> {
        const arn = await this.getCachedIamCallerIdentityArn()
        if (!arn) {
            return undefined
        }

        const sessionName = SmusUtils.extractSessionNameFromArn(arn)
        this.logger.debug(`Extracted session name: ${sessionName || 'none'}`)
        return sessionName
    }

    /**
     * Gets the role ARN from the cached IAM caller identity
     * Converts assumed role ARN to IAM role ARN format
     * Only works for IAM connections - returns undefined for SSO connections
     * @returns Promise resolving to the IAM role ARN, or undefined if not available or not an IAM connection
     */
    public async getIamPrincipalArn(): Promise<string | undefined> {
        const arn = await this.getCachedIamCallerIdentityArn()
        if (!arn) {
            return undefined
        }

        // Convert assumed role ARN to IAM role ARN
        const roleArn = SmusUtils.convertAssumedRoleArnToIamRoleArn(arn)
        this.logger.debug(`Extracted role ARN: ${roleArn || 'none'}`)
        return roleArn
    }

    /**
     * Clears the cached IAM caller identity
     * Should be called when connection changes or credentials are refreshed
     */
    private clearIamCallerIdentityCache(): void {
        this.iamCallerIdentityCache = undefined
        this.logger.debug('Cleared IAM caller identity cache')
    }

    /**
     * Reauthenticates an existing connection
     * @param conn Connection to reauthenticate
     * @returns Promise resolving to the reauthenticated connection
     */
    @withTelemetryContext({ name: 'reauthenticate', class: authClassName })
    public async reauthenticate(conn: SmusConnection): Promise<SmusConnection> {
        try {
            // Check if this is an IAM connection
            if (isSmusIamConnection(conn)) {
                // For IAM connections, show options menu
                this.logger.debug('Showing IAM credential expiry options for reauthentication')
                const result = await showIamCredentialExpiryOptions(this, conn, globals.context)

                // Handle the result - for most actions, return the original connection
                // The actions have already been performed (sign out, edit credentials, etc.)
                if (result.action === IamCredentialExpiryAction.SignOut) {
                    throw new ToolkitError('User signed out from connection', { cancelled: true })
                } else if (result.action === IamCredentialExpiryAction.Cancelled) {
                    throw new ToolkitError('Reauthentication cancelled by user', { cancelled: true })
                }

                // For Reauthenticate, EditCredentials, and SwitchProfile, return the connection
                return conn
            } else {
                // For SSO connections, use existing re-auth flow
                const reauthenticatedConn = await this.auth.reauthenticate(conn)

                // Re-add SMUS-specific properties that aren't preserved by the base auth system
                return {
                    ...reauthenticatedConn,
                    domainUrl: conn.domainUrl,
                    domainId: conn.domainId,
                } as SmusConnection
            }
        } catch (err) {
            throw ToolkitError.chain(err, 'Unable to reauthenticate SageMaker Unified Studio connection.')
        }
    }

    /**
     * Shows a reauthentication prompt to the user
     * @param conn Connection to reauthenticate
     */
    public async showReauthenticationPrompt(conn: SmusConnection): Promise<void> {
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
        const logger = getLogger('smus')

        const connection = this.activeConnection
        if (!connection) {
            throw new ToolkitError('No active SMUS connection available', { code: SmusErrorCodes.NoActiveConnection })
        }

        // Only SSO connections have access tokens
        if (!isSmusSsoConnection(connection)) {
            throw new ToolkitError('Access tokens are only available for SSO connections', {
                code: SmusErrorCodes.InvalidConnectionType,
            })
        }

        try {
            // Type assertion is safe here because we've already checked with isSmusSsoConnection
            const accessToken = await this.auth.getSsoAccessToken(connection as SsoConnection)
            logger.debug(`Successfully retrieved SSO access token for connection ${connection.id}`)

            return accessToken
        } catch (err) {
            logger.error(`Failed to retrieve SSO access token for connection ${connection.id}: %s`, err)

            // Check if this is a reauth error that should be handled by showing SMUS-specific prompt
            if (err instanceof ToolkitError && err.code === 'InvalidConnection') {
                // Re-throw the error to maintain the error flow
                logger.debug(
                    `SMUS: Auth connection has been marked invalid - Likely due to expiry. Reauthentication flow will be triggered, ignoring error`
                )
            }

            throw new ToolkitError(`Failed to retrieve SSO access token for connection ${connection.id}`, {
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
        const logger = getLogger('smus')

        if (!this.activeConnection) {
            throw new ToolkitError('No active SMUS connection available', { code: SmusErrorCodes.NoActiveConnection })
        }

        logger.debug(`Getting project provider for project ${projectId}`)

        // Check if we already have a cached provider for this project
        if (this.projectCredentialProvidersCache.has(projectId)) {
            logger.debug('Using cached project provider')
            return this.projectCredentialProvidersCache.get(projectId)!
        }

        logger.debug('Creating new project provider')
        // Create a new project provider and cache it
        const projectProvider = new ProjectRoleCredentialsProvider(this, projectId)
        this.projectCredentialProvidersCache.set(projectId, projectProvider)

        logger.debug('Cached new project provider')

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
        const logger = getLogger('smus')

        if (!this.activeConnection) {
            throw new ToolkitError('No active SMUS connection available', { code: SmusErrorCodes.NoActiveConnection })
        }

        const cacheKey = `${this.getDomainId()}:${projectId}:${connectionId}`
        logger.debug(`Getting connection provider for connection ${connectionId}`)

        // Check if we already have a cached provider for this connection
        if (this.connectionCredentialProvidersCache.has(cacheKey)) {
            logger.debug('Using cached connection provider')
            return this.connectionCredentialProvidersCache.get(cacheKey)!
        }

        logger.debug('Creating new connection provider')
        // Create a new connection provider and cache it
        const connectionProvider = new ConnectionCredentialsProvider(this, connectionId, projectId)
        this.connectionCredentialProvidersCache.set(cacheKey, connectionProvider)

        logger.debug('Cached new connection provider')

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

        // For SMUS connections (both SSO and IAM) with domainId property
        if ('domainId' in this.activeConnection) {
            return (this.activeConnection as any).domainId
        }

        throw new ToolkitError('Domain ID not available. Please reconnect to SMUS.', {
            code: SmusErrorCodes.NoActiveConnection,
        })
    }

    /**
     * Gets the domain URL from the active connection
     * @returns Domain URL
     */
    public getDomainUrl(): string {
        if (!this.activeConnection) {
            throw new ToolkitError('No active SMUS connection available', { code: SmusErrorCodes.NoActiveConnection })
        }

        // For SMUS connections (both SSO and IAM) with domainUrl property
        if ('domainUrl' in this.activeConnection) {
            return (this.activeConnection as any).domainUrl
        }

        throw new ToolkitError('Domain URL not available. Please reconnect to SMUS.', {
            code: SmusErrorCodes.NoActiveConnection,
        })
    }

    /**
     * Gets the AWS account ID for the active domain connection
     * In SMUS space environment, extracts from ResourceArn in metadata
     * Otherwise, makes an STS GetCallerIdentity call using DER credentials and caches the result
     * @returns Promise resolving to the domain's AWS account ID
     * @throws ToolkitError if unable to retrieve account ID
     */
    public async getDomainAccountId(): Promise<string> {
        const logger = getLogger('smus')

        // Return cached value if available
        if (this.cachedDomainAccountId) {
            logger.debug('Using cached domain account ID')
            return this.cachedDomainAccountId
        }

        // If in SMUS space environment, extract account ID from resource-metadata file
        if (getContext('aws.smus.inSmusSpaceEnvironment')) {
            const accountId = await extractAccountIdFromResourceMetadata()

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

            let credentialsProvider
            if (getContext('aws.smus.isIamMode')) {
                credentialsProvider = await this.getCredentialsProviderForIamProfile(
                    (this.activeConnection as SmusIamConnection).profileName
                )
            } else {
                credentialsProvider = await this.getDerCredentialsProvider()
            }
            // Get the region for STS client
            const region = this.getDomainRegion()

            // Create STS client with DER credentials
            const stsClient = new DefaultStsClient(region, await credentialsProvider.getCredentials())

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
        const logger = getLogger('smus')

        // Return cached value if available
        if (this.cachedProjectAccountIds.has(projectId)) {
            logger.debug(`Using cached project account ID for project ${projectId}`)
            return this.cachedProjectAccountIds.get(projectId)!
        }

        // If in SMUS space environment, extract account ID from resource-metadata file
        if (getContext('aws.smus.inSmusSpaceEnvironment')) {
            const accountId = await extractAccountIdFromResourceMetadata()

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
            const dzClient = await createDZClientBaseOnDomainMode(this)
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

        const connection = this.activeConnection
        if (!connection) {
            throw new ToolkitError('No active SMUS connection available', { code: SmusErrorCodes.NoActiveConnection })
        }

        // Handle different connection types
        if (isSmusSsoConnection(connection)) {
            return connection.ssoRegion
        }

        // For SMUS connections (both SSO and IAM) with region property
        if ('region' in connection) {
            return (connection as any).region
        }

        throw new ToolkitError('Domain region not available. Please reconnect to SMUS.', {
            code: SmusErrorCodes.NoActiveConnection,
        })
    }

    /**
     * Gets or creates a cached credentials provider for the active connection
     * @returns Promise resolving to the credentials provider
     */
    public async getDerCredentialsProvider(): Promise<any> {
        const logger = getLogger('smus')

        if (getContext('aws.smus.inSmusSpaceEnvironment')) {
            // When in SMUS space, DomainExecutionRoleCreds can be found in config file
            // Read the credentials from credential profile DomainExecutionRoleCreds
            try {
                // Load AWS config file to check profile configuration
                const { configFile } = await loadSharedConfigFiles()
                const profileConfig = configFile['DomainExecutionRoleCreds']

                if (profileConfig?.credential_process) {
                    // Normal SMUS domain: Use the profile with credential_process
                    logger.debug('Using DomainExecutionRoleCreds profile with credential_process')
                    const credentials = fromIni({ profile: 'DomainExecutionRoleCreds' })
                    return convertToToolkitCredentialProvider(
                        async () => await credentials(),
                        'DomainExecutionRoleCreds',
                        `smus-der-profile:${this.getDomainId()}:${this.getDomainRegion()}`,
                        this.getDomainRegion()
                    )
                } else if (profileConfig?.credential_source === 'EcsContainer') {
                    // IAM-based domain with EcsContainer: Use ECS container credentials directly
                    // The environment has AWS_CONTAINER_CREDENTIALS_RELATIVE_URI set, so use fromContainerMetadata
                    // which properly handles the ECS credential endpoint
                    logger.debug('IAM-based domain detected, using ECS container credentials')
                    const credentials = fromContainerMetadata({
                        timeout: 5000,
                        maxRetries: 3,
                    })
                    return convertToToolkitCredentialProvider(
                        async () => await credentials(),
                        'EcsContainer',
                        `smus-ecs-container:${this.getDomainId()}:${this.getDomainRegion()}`,
                        this.getDomainRegion()
                    )
                } else {
                    // Fallback: try the profile anyway
                    logger.debug(
                        'SMUS: Unknown profile configuration, attempting to use DomainExecutionRoleCreds profile'
                    )
                    const credentials = fromIni({ profile: 'DomainExecutionRoleCreds' })
                    return convertToToolkitCredentialProvider(
                        async () => await credentials(),
                        'DomainExecutionRoleCreds-fallback',
                        `smus-der-fallback:${this.getDomainId()}:${this.getDomainRegion()}`,
                        this.getDomainRegion()
                    )
                }
            } catch (error) {
                logger.error('Failed to load config file, falling back to default credential chain: %s', error)
                const credentials = fromNodeProviderChain()
                return convertToToolkitCredentialProvider(
                    async () => await credentials(),
                    'NodeProviderChain',
                    `smus-node-provider-chain:${this.getDomainId()}:${this.getDomainRegion()}`,
                    this.getDomainRegion()
                )
            }
        }

        const connection = this.activeConnection
        if (!connection) {
            throw new ToolkitError('No active SMUS connection available', { code: SmusErrorCodes.NoActiveConnection })
        }

        // Domain Execution Role credentials are only available for SSO connections
        if (!isSmusSsoConnection(connection)) {
            throw new ToolkitError('Domain Execution Role credentials are only available for SSO connections', {
                code: SmusErrorCodes.InvalidConnectionType,
            })
        }

        // Create a cache key based on the connection details
        const cacheKey = `${connection.ssoRegion}:${connection.domainId}`

        logger.debug(`Getting credentials provider for cache key: ${cacheKey}`)

        // Check if we already have a cached provider
        if (this.credentialsProviderCache.has(cacheKey)) {
            logger.debug('Using cached credentials provider')
            return this.credentialsProviderCache.get(cacheKey)
        }

        logger.debug('Creating new credentials provider')

        // Create a new provider and cache it
        const provider = new DomainExecRoleCredentialsProvider(
            connection.domainUrl,
            connection.domainId,
            connection.ssoRegion,
            async () => await this.getAccessToken()
        )

        this.credentialsProviderCache.set(cacheKey, provider)
        logger.debug('Cached new credentials provider')

        return provider
    }

    /**
     * Invalidates all cached credentials (for all connections)
     * Used during connection changes or logout
     */
    private async invalidateAllCredentialsInCache(): Promise<void> {
        const logger = getLogger('smus')
        logger.debug('Invalidating all cached credentials')

        // Clear all cached DER providers and their internal credentials
        for (const [cacheKey, provider] of this.credentialsProviderCache.entries()) {
            try {
                provider.invalidate() // This will clear the provider's internal cache
                logger.debug(`Invalidated credentials for cache key: ${cacheKey}`)
            } catch (err) {
                logger.warn(`Failed to invalidate credentials for cache key ${cacheKey}: %s`, err)
            }
        }

        // Clear all cached project providers and their internal credentials

        await this.invalidateAllProjectCredentialsInCache()
        // Clear all cached connection providers and their internal credentials
        for (const [cacheKey, connectionProvider] of this.connectionCredentialProvidersCache.entries()) {
            try {
                connectionProvider.invalidate() // This will clear the connection provider's internal cache
                logger.debug(`Invalidated connection credentials for cache key: ${cacheKey}`)
            } catch (err) {
                logger.warn(`Failed to invalidate connection credentials for cache key ${cacheKey}: %s`, err)
            }
        }

        // Clear cached domain account ID
        this.cachedDomainAccountId = undefined
        logger.debug('Cleared cached domain account ID')

        // Clear cached project account IDs
        this.cachedProjectAccountIds.clear()
        logger.debug('Cleared cached project account IDs')
    }

    /**
     * Invalidates all project cached credentials
     */
    public async invalidateAllProjectCredentialsInCache(): Promise<void> {
        const logger = getLogger('smus')
        logger.debug('Invalidating all cached project credentials')

        for (const [projectId, projectProvider] of this.projectCredentialProvidersCache.entries()) {
            try {
                projectProvider.invalidate() // This will clear the project provider's internal cache
                logger.debug(`Invalidated project credentials for project: ${projectId}`)
            } catch (err) {
                logger.warn(`Failed to invalidate project credentials for project ${projectId}: %s`, err)
            }
        }
    }

    /**
     * Stops SSH credential refresh and cleans up resources
     */
    public dispose(): void {
        this.logger.debug('Disposing authentication provider and all cached providers')

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

        // Clear cached IAM caller identity
        this.clearIamCallerIdentityCache()

        DataZoneClient.dispose()
        DataZoneCustomClientHelper.dispose()

        this.logger.debug('Successfully disposed authentication provider')
    }

    static #instance: SmusAuthenticationProvider | undefined

    public static get instance(): SmusAuthenticationProvider | undefined {
        return SmusAuthenticationProvider.#instance
    }

    public static fromContext() {
        return (this.#instance ??= new this())
    }

    public async invalidateConnection(): Promise<void> {
        // When in SMUS space, the extension is already running in projet context and sign in is not needed
        if (getContext('aws.smus.inSmusSpaceEnvironment')) {
            return
        }

        if (!this.activeConnection) {
            return
        }

        // For IAM connections, actively validate credentials
        // No action needed for SSO as the connection is automatically updated
        if (isSmusIamConnection(this.activeConnection)) {
            try {
                const validation = await this.validateIamProfile(this.activeConnection.profileName)
                await this.auth.updateConnectionState(
                    this.activeConnection.id,
                    validation.isValid ? 'valid' : 'invalid'
                )
            } catch {
                await this.auth.updateConnectionState(this.activeConnection.id, 'invalid')
            }
        }
    }
}
