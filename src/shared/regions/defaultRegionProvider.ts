/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Endpoints, Region } from './endpoints'
import { EndpointsProvider } from './endpointsProvider'
import { RegionInfo } from './regionInfo'
import { RegionProvider } from './regionProvider'

export class DefaultRegionProvider implements RegionProvider {
    private _loadedRegions: RegionInfo[] = []

    public constructor(endpointsProvider: EndpointsProvider) {
        endpointsProvider.onEndpointsUpdated(e => this.loadFromEndpointsProvider(e))
        this.loadFromEndpointsProvider(endpointsProvider)
    }

    public async getRegionData(): Promise<RegionInfo[]> {
        return this._loadedRegions
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
