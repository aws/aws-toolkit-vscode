/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Endpoints, Partition, Region } from './endpoints'
import { EndpointsProvider } from './endpointsProvider'
import { RegionInfo } from './regionInfo'
import { RegionProvider } from './regionProvider'

interface RegionData {
    partitionId: string
    serviceIds: string[]
}

export class DefaultRegionProvider implements RegionProvider {
    // TODO : Deprecate _loadedRegions
    private _loadedRegions: RegionInfo[] = []
    private partitions: Partition[] = []
    private readonly regionIdToRegionData: Map<string, RegionData> = new Map()

    public constructor(endpointsProvider: EndpointsProvider) {
        endpointsProvider.onEndpointsUpdated(e => this.loadFromEndpointsProvider(e))
        this.loadFromEndpointsProvider(endpointsProvider)
    }

    public async getRegionData(): Promise<RegionInfo[]> {
        return this._loadedRegions
    }

    public getRegions(partitionId: string): Region[] {
        let regions: Region[] = []

        this.partitions
            .filter(p => p.id === partitionId)
            .forEach(p => {
                regions = regions.concat(p.regions)
            })

        return regions
    }

    public getParentPartitionId(regionId: string): string | undefined {
        return this.regionIdToRegionData.get(regionId)?.partitionId
    }

    public isServiceInRegion(serviceId: string, regionId: string): boolean {
        return !!this.regionIdToRegionData.get(regionId)?.serviceIds.find(x => x === serviceId) ?? false
    }

    private loadFromEndpointsProvider(provider: EndpointsProvider) {
        const endpoints = provider.getEndpoints()

        if (endpoints) {
            this.loadFromEndpoints(endpoints)
        }
    }

    private loadFromEndpoints(endpoints: Endpoints) {
        // TODO : Support other Partition regions : https://github.com/aws/aws-toolkit-vscode/issues/188
        this._loadedRegions = getRegionInfo(endpoints, 'aws')
        this.partitions = endpoints.partitions

        this.regionIdToRegionData.clear()

        endpoints.partitions.forEach(p => {
            p.regions.forEach(r =>
                this.regionIdToRegionData.set(r.id, {
                    partitionId: p.id,
                    serviceIds: []
                })
            )

            p.services.forEach(s => {
                s.endpoints.forEach(e => {
                    const regionData = this.regionIdToRegionData.get(e.regionId)

                    if (regionData) {
                        regionData.serviceIds.push(s.id)
                    }
                })
            })
        })
    }
}

function getRegionInfo(endpoints: Endpoints, partitionId: string): RegionInfo[] {
    let regions: RegionInfo[] = []

    endpoints.partitions
        .filter(partition => partition.id === partitionId)
        .forEach(partition => {
            regions = regions.concat(partition.regions.map(asRegionInfo))
        })

    return regions
}

function asRegionInfo(region: Region): RegionInfo {
    return {
        regionCode: region.id,
        regionName: region.description
    }
}
