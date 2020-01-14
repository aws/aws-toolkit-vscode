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
import { RegionInfo } from './regionInfo'
import { RegionProvider } from './regionProvider'

export interface RawRegion {
    description: string
}

export interface RawPartition {
    partition: string
    regions: {
        [regionKey: string]: RawRegion
    }
}

export interface RawEndpoints {
    partitions: RawPartition[]
}

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

            const allEndpoints = JSON.parse(endpointsContents) as RawEndpoints

            availableRegions = getRegionsFromEndpoints(allEndpoints)

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

export function getRegionsFromPartition(partition: RawPartition): RegionInfo[] {
    return Object.keys(partition.regions).map(
        regionKey => new RegionInfo(regionKey, `${partition.regions[regionKey].description}`)
    )
}

export function getRegionsFromEndpoints(endpoints: RawEndpoints): RegionInfo[] {
    return (
        endpoints.partitions
            // TODO : Support other Partition regions : https://github.com/aws/aws-toolkit-vscode/issues/188
            .filter(partition => partition.partition && partition.partition === 'aws')
            .reduce((accumulator: RegionInfo[], partition: RawPartition) => {
                accumulator.push(...getRegionsFromPartition(partition))

                return accumulator
            }, [])
    )
}
