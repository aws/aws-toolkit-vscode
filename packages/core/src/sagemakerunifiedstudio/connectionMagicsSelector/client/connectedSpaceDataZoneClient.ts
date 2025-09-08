/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { DataZone, ListConnectionsCommandOutput } from '@aws-sdk/client-datazone'
import { getLogger } from '../../../shared/logger/logger'

/**
 * Represents a DataZone connection
 */
export interface DataZoneConnection {
    connectionId: string
    name: string
    type: string
    props?: Record<string, any>
}

/**
 * DataZone client for use in a SageMaker Unified Studio connected space
 * Uses the user's current AWS credentials (project role credentials)
 */
export class ConnectedSpaceDataZoneClient {
    private datazoneClient: DataZone | undefined
    private readonly logger = getLogger()

    constructor(
        private readonly region: string,
        private readonly customEndpoint?: string
    ) {}

    /**
     * Gets the DataZone client, initializing it if necessary
     * Uses default AWS credentials from the environment (project role)
     * Supports custom endpoints for non-production environments
     */
    private getDataZoneClient(): DataZone {
        if (!this.datazoneClient) {
            try {
                const clientConfig: any = {
                    region: this.region,
                }

                // Use custom endpoint if provided (for non-prod environments)
                if (this.customEndpoint) {
                    clientConfig.endpoint = this.customEndpoint
                    this.logger.debug(
                        `ConnectedSpaceDataZoneClient: Using custom DataZone endpoint: ${this.customEndpoint}`
                    )
                } else {
                    this.logger.debug(
                        `ConnectedSpaceDataZoneClient: Using default AWS DataZone endpoint for region: ${this.region}`
                    )
                }

                this.logger.debug('ConnectedSpaceDataZoneClient: Creating DataZone client with default credentials')
                this.datazoneClient = new DataZone(clientConfig)
                this.logger.debug('ConnectedSpaceDataZoneClient: Successfully created DataZone client')
            } catch (err) {
                this.logger.error('ConnectedSpaceDataZoneClient: Failed to create DataZone client: %s', err as Error)
                throw err
            }
        }
        return this.datazoneClient
    }

    /**
     * Lists the connections in a DataZone domain and project
     * @param domainId The DataZone domain identifier
     * @param projectId The DataZone project identifier
     * @returns List of connections
     */
    public async listConnections(domainId: string, projectId: string): Promise<DataZoneConnection[]> {
        try {
            this.logger.info(
                `ConnectedSpaceDataZoneClient: Listing connections for domain ${domainId}, project ${projectId}`
            )

            const datazoneClient = this.getDataZoneClient()

            const response: ListConnectionsCommandOutput = await datazoneClient.listConnections({
                domainIdentifier: domainId,
                projectIdentifier: projectId,
            })

            if (!response.items || response.items.length === 0) {
                this.logger.info(
                    `ConnectedSpaceDataZoneClient: No connections found for domain ${domainId}, project ${projectId}`
                )
                return []
            }

            const connections: DataZoneConnection[] = response.items.map((connection) => ({
                connectionId: connection.connectionId || '',
                name: connection.name || '',
                type: connection.type || '',
                props: connection.props || {},
            }))

            this.logger.info(
                `ConnectedSpaceDataZoneClient: Found ${connections.length} connections for domain ${domainId}, project ${projectId}`
            )
            return connections
        } catch (err) {
            this.logger.error('ConnectedSpaceDataZoneClient: Failed to list connections: %s', err as Error)
            throw err
        }
    }
}
