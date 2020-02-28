/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../logger'
import { Endpoints, Region } from './endpoints'
import { EndpointsProvider } from './endpointsProvider'
import { RegionProvider } from './regionProvider'

interface RegionData {
    partitionId: string
    region: Region
    serviceIds: string[]
}

export class DefaultRegionProvider implements RegionProvider {
    private readonly onRegionProviderUpdatedEmitter: vscode.EventEmitter<void> = new vscode.EventEmitter()
    private readonly regionIdToRegionData: Map<string, RegionData> = new Map()

    public constructor(endpointsProvider: EndpointsProvider) {
        endpointsProvider.onEndpointsUpdated(e => this.loadFromEndpointsProvider(e))
        this.loadFromEndpointsProvider(endpointsProvider)
    }

    public get onRegionProviderUpdated(): vscode.Event<void> {
        return this.onRegionProviderUpdatedEmitter.event
    }

    public isServiceInRegion(serviceId: string, regionId: string): boolean {
        return !!this.regionIdToRegionData.get(regionId)?.serviceIds.find(x => x === serviceId) ?? false
    }

    public getPartitionId(regionId: string): string | undefined {
        const partitionId = this.regionIdToRegionData.get(regionId)?.partitionId

        if (!partitionId) {
            getLogger().warn(`Unable to determine the Partition that Region ${regionId} belongs to`)
        }

        return partitionId ?? undefined
    }

    public getRegions(partitionId: string): Region[] {
        return [...this.regionIdToRegionData.values()]
            .filter(region => region.partitionId === partitionId)
            .map(region => region.region)
    }

    private loadFromEndpointsProvider(provider: EndpointsProvider) {
        const endpoints = provider.getEndpoints()

        if (endpoints) {
            this.loadFromEndpoints(endpoints)
        }
    }

    private loadFromEndpoints(endpoints: Endpoints) {
        this.regionIdToRegionData.clear()

        endpoints.partitions.forEach(partition => {
            partition.regions.forEach(region =>
                this.regionIdToRegionData.set(region.id, {
                    partitionId: partition.id,
                    region: region,
                    serviceIds: []
                })
            )

            partition.services.forEach(service => {
                service.endpoints.forEach(endpoint => {
                    const regionData = this.regionIdToRegionData.get(endpoint.regionId)

                    if (regionData) {
                        regionData.serviceIds.push(service.id)
                    }
                })
            })
        })

        this.onRegionProviderUpdatedEmitter.fire()
    }
}
