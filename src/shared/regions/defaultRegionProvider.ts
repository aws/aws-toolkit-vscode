/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { endpointsFileUrl } from '../constants'
import { ext } from '../extensionGlobals'
import { getLogger, Logger } from '../logger'
import { CompositeResourceFetcher } from '../resourcefetcher/compositeResourceFetcher'
import { FileResourceFetcher } from '../resourcefetcher/fileResourceFetcher'
import { HttpResourceFetcher } from '../resourcefetcher/httpResourceFetcher'
import { ResourceFetcher } from '../resourcefetcher/resourcefetcher'
import { Endpoints, loadEndpoints, Region } from './endpoints'
import { RegionInfo } from './regionInfo'
import { RegionProvider } from './regionProvider'

export class DefaultRegionProvider implements RegionProvider {
    private readonly logger: Logger = getLogger()
    private _areRegionsLoaded: boolean = false
    private _loadedRegions: RegionInfo[]
    private readonly _resourceFetcher: ResourceFetcher

    public constructor(resourceFetcher: ResourceFetcher) {
        this._loadedRegions = []
        this._resourceFetcher = resourceFetcher
    }

    // Returns an array of Regions, and caches them in memory.
    public async getRegionData(): Promise<RegionInfo[]> {
        if (this._areRegionsLoaded) {
            return this._loadedRegions
        }

        let availableRegions: RegionInfo[] = []
        try {
            this.logger.info('Retrieving AWS endpoint data')

            const endpointsContents = await this._resourceFetcher.get()

            if (!endpointsContents) {
                throw new Error('No endpoints data found')
            }

            const endpoints = loadEndpoints(endpointsContents)

            // TODO : Support other Partition regions : https://github.com/aws/aws-toolkit-vscode/issues/188
            availableRegions = getRegionInfo(endpoints, 'aws')

            this._areRegionsLoaded = true
            this._loadedRegions = availableRegions
        } catch (err) {
            this._areRegionsLoaded = false
            this.logger.error('Unable to retrieve AWS endpoints: ', err as Error)
            // TODO: now what, oneline + local failed...?
            availableRegions = []
            this._loadedRegions = []
        }

        return availableRegions
    }
}

export function makeEndpointsResourceFetcher(extensionContext: vscode.ExtensionContext): ResourceFetcher {
    return new CompositeResourceFetcher(
        new HttpResourceFetcher(endpointsFileUrl),
        new FileResourceFetcher(ext.manifestPaths.endpoints)
    )
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
