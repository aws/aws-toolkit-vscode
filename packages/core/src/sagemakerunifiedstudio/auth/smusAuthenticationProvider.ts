/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { Auth } from '../../auth/auth'
import { getSecondaryAuth } from '../../auth/secondaryAuth'
import { ToolkitError } from '../../shared/errors'
import { withTelemetryContext } from '../../shared/telemetry/util'
import { SsoConnection } from '../../auth/connection'
import { showReauthenticateMessage } from '../../shared/utilities/messages'
import * as localizedText from '../../shared/localizedText'
import { ToolkitPromptSettings } from '../../shared/settings'
import { setContext } from '../../shared/vscode/setContext'
import { DataZoneClient } from '../shared/client/datazoneClient'
import { createSmusProfile, isValidSmusConnection, SmusConnection } from './model'
import { getLogger } from '../../shared/logger/logger'

/**
 * Sets the context variable for SageMaker Unified Studio connection state
 * @param isConnected Whether SMUS is connected
 */
export function setSmusConnectedContext(isConnected: boolean): Promise<void> {
    return setContext('aws.smus.connected', isConnected)
}
const authClassName = 'SmusAuthenticationProvider'

/**
 * Authentication provider for SageMaker Unified Studio
 * Manages authentication state and credentials for SMUS
 */
export class SmusAuthenticationProvider {
    public readonly onDidChangeActiveConnection = this.secondaryAuth.onDidChangeActiveConnection
    private readonly onDidChangeEmitter = new vscode.EventEmitter<void>()
    public readonly onDidChange = this.onDidChangeEmitter.event

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
            await setSmusConnectedContext(this.isConnected())
            this.onDidChangeEmitter.fire()
        })

        // Set initial context in case event does not trigger
        void setSmusConnectedContext(this.isConnectionValid())
    }

    /**
     * Gets the active connection
     */
    public get activeConnection() {
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
        return this.activeConnection !== undefined && !this.secondaryAuth.isConnectionExpired
    }

    /**
     * Checks if connected to SMUS
     */
    public isConnected(): boolean {
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
            // Create DataZoneClient instance and extract domain info
            const dataZoneClient = DataZoneClient.getInstance()
            const { domainId, region } = dataZoneClient.extractDomainInfoFromUrl(domainUrl)

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
                    logger.debug(`SMUS: Reused existing connection successfully, id=${result.id}`)
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
                    return result
                }
            }

            // No existing connection found, create a new one
            logger.info('SMUS: No existing connection found, creating new connection')

            // Get SSO instance info from DataZone
            const ssoInstanceInfo = await dataZoneClient.getSsoInstanceInfo(domainUrl)

            // Create a new connection
            const profile = createSmusProfile(domainUrl, domainId, ssoInstanceInfo.issuerUrl, ssoInstanceInfo.region)
            const newConn = await this.auth.createConnection(profile)
            logger.debug(`SMUS: Created new connection ${newConn.id}`)

            const smusConn: SmusConnection = {
                ...newConn,
                domainUrl,
                domainId,
            }

            const result = await this.secondaryAuth.useNewConnection(smusConn)
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
            reauthFunc: async () => {
                await this.reauthenticate(conn)
            },
        })
    }

    // URL extraction functions have been moved to DataZoneClient

    static #instance: SmusAuthenticationProvider | undefined

    public static get instance(): SmusAuthenticationProvider | undefined {
        return SmusAuthenticationProvider.#instance
    }

    public static fromContext() {
        return (this.#instance ??= new this())
    }
}
