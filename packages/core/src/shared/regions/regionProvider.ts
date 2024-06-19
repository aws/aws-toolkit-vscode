/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from '../extensionGlobals'

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import { getLogger } from '../logger'
import { Endpoints, loadEndpoints, Region } from './endpoints'
import { regionSettingKey } from '../constants'
import { AwsContext } from '../awsContext'
import { getIdeProperties, isAmazonQ, isCloud9 } from '../extensionUtilities'
import { ResourceFetcher } from '../resourcefetcher/resourcefetcher'
import { isSsoConnection } from '../../auth/connection'
import { Auth } from '../../auth'

export const defaultRegion = 'us-east-1'
export const defaultPartition = 'aws'
export const defaultDnsSuffix = 'amazonaws.com'

interface RegionData {
    dnsSuffix: string
    partitionId: string
    region: Region
    serviceIds: string[]
}

export class RegionProvider {
    private readonly regionData: Map<string, RegionData> = new Map()
    private readonly onDidChangeEmitter = new vscode.EventEmitter<void>()
    public readonly onDidChange = this.onDidChangeEmitter.event

    private lastTouchedRegion?: string

    public constructor(
        endpoints: Endpoints = { partitions: [] },
        private readonly globalState = globals.context.globalState,
        private readonly awsContext: Pick<AwsContext, 'getCredentialDefaultRegion'> = globals.awsContext
    ) {
        this.loadFromEndpoints(endpoints)
    }

    public get defaultRegionId() {
        return this.awsContext.getCredentialDefaultRegion() ?? defaultRegion
    }

    public get defaultPartitionId() {
        return this.getPartitionId(this.defaultRegionId)
    }

    public isServiceInRegion(serviceId: string, regionId: string): boolean {
        return !!this.regionData.get(regionId)?.serviceIds.find(x => x === serviceId) ?? false
    }

    public getPartitionId(regionId: string): string | undefined {
        const partitionId = this.regionData.get(regionId)?.partitionId

        if (!partitionId) {
            getLogger().warn(`Unable to determine the Partition that Region ${regionId} belongs to`)
        }

        return partitionId ?? undefined
    }

    public getDnsSuffixForRegion(regionId: string): string | undefined {
        const dnsSuffix = this.regionData.get(regionId)?.dnsSuffix

        if (!dnsSuffix) {
            getLogger().warn(`Unable to find region data for: ${regionId}`)
        }

        return dnsSuffix ?? undefined
    }

    public getRegions(partitionId = this.defaultPartitionId): Region[] {
        return [...this.regionData.values()]
            .filter(region => region.partitionId === partitionId)
            .map(region => region.region)
    }

    public getExplorerRegions(): string[] {
        return this.globalState.get<string[]>(regionSettingKey, [])
    }

    public async updateExplorerRegions(regions: string[]): Promise<void> {
        return this.globalState.update(regionSettingKey, Array.from(new Set(regions)))
    }

    /**
     * @returns heuristic for default region based on
     * last touched region in auth, explorer, wizard response.
     */
    public guessDefaultRegion(): string | undefined {
        const conn = Auth.instance.activeConnection
        if (isAmazonQ() && isSsoConnection(conn)) {
            // Only the current auth region makes sense for Amazon Q use cases.
            return conn.ssoRegion
        }

        if (conn?.type === 'sso') {
            return conn.ssoRegion
        }

        const explorerRegions = this.getExplorerRegions()
        if (explorerRegions.length === 1) {
            return explorerRegions[0]
        }

        if (this.lastTouchedRegion) {
            return this.lastTouchedRegion
        }

        const lastWizardResponse = this.globalState.get<Region>('lastSelectedRegion')
        if (lastWizardResponse && lastWizardResponse.id) {
            return lastWizardResponse.id
        }

        return undefined
    }

    public setLastTouchedRegion(region: string | undefined) {
        if (region) {
            this.lastTouchedRegion = region
        }
    }

    private loadFromEndpoints(endpoints: Endpoints) {
        this.regionData.clear()
        endpoints.partitions.forEach(partition => {
            partition.regions.forEach(region =>
                this.regionData.set(region.id, {
                    dnsSuffix: partition.dnsSuffix,
                    partitionId: partition.id,
                    region: region,
                    serviceIds: [],
                })
            )

            partition.services.forEach(service => {
                service.endpoints.forEach(endpoint => {
                    const regionData = this.regionData.get(endpoint.regionId)

                    if (regionData) {
                        regionData.serviceIds.push(service.id)
                    }
                })
            })
        })
        this.onDidChangeEmitter.fire()
    }

    /**
     * @param endpointsProvider.local Retrieves endpoints manifest from local sources available to the toolkit. Expected
     *                                to resolve fast, and is both a placeholder until the remote resources are loaded, and
     *                                is a fallback in case the toolkit is unable to load a remote resource
     * @param endpointsProvider.remote Retrieves endpoints manifest from remote host
     */
    public static fromEndpointsProvider(endpointsProvider: {
        local: () => Endpoints | Promise<Endpoints>
        remote: () => Endpoints | Promise<Endpoints>
    }): RegionProvider {
        const instance = new this()

        async function load() {
            getLogger().info('endpoints: retrieving AWS endpoints data')
            instance.loadFromEndpoints(await endpointsProvider.local())

            try {
                instance.loadFromEndpoints(await endpointsProvider.remote())
            } catch (err) {
                getLogger().warn(
                    `endpoints: failed to load from remote source, region data may appear outdated: %s`,
                    err
                )
            }
        }

        load().catch(err => {
            getLogger().error('Failure while loading Endpoints Manifest: %s', err)

            return vscode.window.showErrorMessage(
                `${localize(
                    'AWS.error.endpoint.load.failure',
                    'The {0} Toolkit was unable to load endpoints data.',
                    getIdeProperties().company
                )} ${
                    isCloud9()
                        ? localize(
                              'AWS.error.impactedFunctionalityReset.cloud9',
                              'Toolkit functionality may be impacted until the Cloud9 browser tab is refreshed.'
                          )
                        : localize(
                              'AWS.error.impactedFunctionalityReset.vscode',
                              'Toolkit functionality may be impacted until VS Code is restarted.'
                          )
                }`
            )
        })

        return instance
    }
}

export async function getEndpointsFromFetcher(fetcher: ResourceFetcher): Promise<Endpoints> {
    const endpointsJson = await fetcher.get()
    if (!endpointsJson) {
        throw new Error('Failed to get resource')
    }

    const endpoints = loadEndpoints(endpointsJson)
    if (!endpoints) {
        throw new Error('Failed to load endpoints')
    }

    return endpoints
}
