/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLogger } from '../../../shared/logger/logger'
import {
    Constants,
    connectionTypePropertiesMap,
    connectionLabelPropertiesMap,
    connectionTypeToComputeNameMap,
} from '../models/constants'
import {
    ConnectionOption,
    ProjectOptionGroup,
    ConnectionProjectMapping,
    SageMakerConnectionSummary,
} from '../models/types'
import { ConnectedSpaceDataZoneClient } from '../client/connectedSpaceDataZoneClient'
import { getResourceMetadata } from '../../shared/utils/resourceMetadataUtils'

let datazoneClient: ConnectedSpaceDataZoneClient | undefined

/**
 * Gets or creates the module-scoped DataZone client instance
 */
function getDataZoneClient(): ConnectedSpaceDataZoneClient {
    if (!datazoneClient) {
        const resourceMetadata = getResourceMetadata()

        if (!resourceMetadata?.AdditionalMetadata?.DataZoneDomainRegion) {
            throw new Error('DataZone domain region not found in resource metadata')
        }

        const region = resourceMetadata.AdditionalMetadata.DataZoneDomainRegion
        const customEndpoint = resourceMetadata.AdditionalMetadata?.DataZoneEndpoint

        datazoneClient = new ConnectedSpaceDataZoneClient(region, customEndpoint)
    }
    return datazoneClient
}

/**
 * Service for managing connection options and project mappings
 */
class ConnectionOptionsService {
    private connectionOptions: ConnectionOption[] = []
    private projectOptions: ConnectionProjectMapping[] = []
    private cachedConnections: SageMakerConnectionSummary[] = []

    constructor() {}

    /**
     * Gets the appropriate connection option for a given label
     */
    private getConnectionOptionForLabel(label: string): ConnectionOption | undefined {
        const labelProps = connectionLabelPropertiesMap[label]
        if (!labelProps) {
            return undefined
        }

        return {
            label,
            description: labelProps.description,
            magic: labelProps.magic,
            language: labelProps.language,
            category: labelProps.category,
        }
    }

    /**
     * Gets filtered connections from DataZone, excluding IAM connections and processing SPARK connections
     */
    private async getFilteredConnections(forceRefresh: boolean = false): Promise<SageMakerConnectionSummary[]> {
        if (this.cachedConnections.length > 0 && !forceRefresh) {
            return this.cachedConnections
        }

        try {
            const resourceMetadata = getResourceMetadata()

            if (!resourceMetadata?.AdditionalMetadata?.DataZoneDomainId) {
                throw new Error('DataZone domain ID not found in resource metadata')
            }

            if (!resourceMetadata?.AdditionalMetadata?.DataZoneProjectId) {
                throw new Error('DataZone project ID not found in resource metadata')
            }

            const connections = await getDataZoneClient().listConnections(
                resourceMetadata.AdditionalMetadata.DataZoneDomainId,
                resourceMetadata.AdditionalMetadata.DataZoneProjectId
            )

            const processedConnections: SageMakerConnectionSummary[] = []

            for (const connection of connections) {
                if (
                    connection.type === Constants.CONNECTION_TYPE_REDSHIFT ||
                    connection.type === Constants.CONNECTION_TYPE_ATHENA
                ) {
                    processedConnections.push({
                        name: connection.name || '',
                        type: connection.type || '',
                    })
                } else if (connection.type === Constants.CONNECTION_TYPE_SPARK) {
                    if ('sparkGlueProperties' in (connection.props || {})) {
                        processedConnections.push({
                            name: connection.name || '',
                            type: Constants.CONNECTION_TYPE_GLUE,
                        })
                    } else if (
                        'sparkEmrProperties' in (connection.props || {}) &&
                        'computeArn' in (connection.props?.sparkEmrProperties || {})
                    ) {
                        const computeArn = connection.props?.sparkEmrProperties?.computeArn || ''

                        if (computeArn.includes('cluster')) {
                            processedConnections.push({
                                name: connection.name || '',
                                type: Constants.CONNECTION_TYPE_EMR_EC2,
                            })
                        } else if (computeArn.includes('applications')) {
                            processedConnections.push({
                                name: connection.name || '',
                                type: Constants.CONNECTION_TYPE_EMR_SERVERLESS,
                            })
                        }
                    }
                }
            }

            this.cachedConnections = processedConnections
            return processedConnections
        } catch (error) {
            getLogger('smus').error('Failed to list DataZone connections: %s', error as Error)
            return []
        }
    }

    /**
     * Adds custom Local Python option to the options list
     */
    private addLocalPythonOption(options: ConnectionOption[], addedLabels: Set<string>): void {
        const localPythonOption = this.getConnectionOptionForLabel('Local Python')
        if (localPythonOption) {
            options.push(localPythonOption)
            addedLabels.add('Local Python')
        }
    }

    /**
     * Gets the available connection options, either from DataZone connections or defaults
     * @returns Array of connection options
     */
    public async getConnectionOptions(): Promise<ConnectionOption[]> {
        try {
            const connections = await this.getFilteredConnections()

            if (connections.length === 0) {
                return []
            }

            const options: ConnectionOption[] = []
            const addedLabels = new Set<string>()

            this.addLocalPythonOption(options, addedLabels)

            for (const connection of connections) {
                const typeProps = connectionTypePropertiesMap[connection.type]
                if (typeProps) {
                    for (const label of typeProps.labels) {
                        if (!addedLabels.has(label)) {
                            const connectionOption = this.getConnectionOptionForLabel(label)
                            if (connectionOption) {
                                options.push(connectionOption)
                                addedLabels.add(label)
                            }
                        }
                    }
                }
            }

            if (addedLabels.has(Constants.PYSPARK) && !addedLabels.has(Constants.SCALA_SPARK)) {
                const scalaSparkOption = this.getConnectionOptionForLabel(Constants.SCALA_SPARK)
                if (scalaSparkOption) {
                    options.push(scalaSparkOption)
                }
            }

            return options
        } catch (error) {
            getLogger('smus').error('Failed to get connection options: %s', error as Error)
            return []
        }
    }

    /**
     * Gets the project options for a specific connection type
     * @param connectionType The connection type
     * @returns Project options for the connection type
     */
    public async getProjectOptionsForConnectionType(connectionType: string): Promise<ProjectOptionGroup[]> {
        try {
            const connections = await this.getFilteredConnections()

            if (connections.length === 0) {
                return []
            }

            const effectiveConnectionType = connectionType === 'ScalaSpark' ? 'PySpark' : connectionType
            const filteredConnections: Record<string, string[]> = {}

            for (const connection of connections) {
                const typeProps = connectionTypePropertiesMap[connection.type]

                if (typeProps && typeProps.labels.includes(effectiveConnectionType)) {
                    const compute = connectionTypeToComputeNameMap[connection.type] || 'Unknown'

                    if (!filteredConnections[compute]) {
                        filteredConnections[compute] = []
                    }
                    filteredConnections[compute].push(connection.name)
                }
            }

            const projectOptions: ProjectOptionGroup[] = []
            for (const [compute, projects] of Object.entries(filteredConnections)) {
                projectOptions.push({ connection: compute, projects })
            }

            return projectOptions
        } catch (error) {
            getLogger('smus').error('Failed to get project options: %s', error as Error)
            return []
        }
    }

    /**
     * Updates the connection and project options from DataZone
     */
    public async updateConnectionAndProjectOptions(): Promise<void> {
        try {
            this.connectionOptions = await this.getConnectionOptions()

            if (this.connectionOptions.length === 0) {
                this.projectOptions = []
                return
            }

            const newProjectOptions: ConnectionProjectMapping[] = []

            newProjectOptions.push({
                connection: 'Local Python',
                projectOptions: [{ connection: 'Local', projects: ['project.python'] }],
            })

            for (const option of this.connectionOptions) {
                if (option.label !== 'Local Python') {
                    const projectOpts = await this.getProjectOptionsForConnectionType(option.label)
                    if (projectOpts.length > 0) {
                        newProjectOptions.push({
                            connection: option.label,
                            projectOptions: projectOpts,
                        })
                    }
                }
            }

            this.projectOptions = newProjectOptions
        } catch (error) {
            getLogger('smus').error('Failed to update connection and project options: %s', error as Error)
            this.connectionOptions = []
            this.projectOptions = []
        }
    }

    /**
     * Gets the current cached connection options
     */
    public getConnectionOptionsSync(): ConnectionOption[] {
        return this.connectionOptions
    }

    /**
     * Gets the current cached project options
     */
    public getProjectOptionsSync(): ConnectionProjectMapping[] {
        return this.projectOptions
    }
}

export const connectionOptionsService = new ConnectionOptionsService()
