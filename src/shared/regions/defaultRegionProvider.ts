/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import path = require('path')
import { ExtensionContext } from 'vscode'
import { endpointsFileUrl } from '../constants'
import { getLogger, Logger } from '../logger'
import { ResourceFetcher } from '../resourceFetcher'
import { FileResourceLocation, WebResourceLocation } from '../resourceLocation'
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

    private _areRegionsLoaded: boolean = false
    private _loadedRegions: RegionInfo[]
    private readonly _context: ExtensionContext
    private readonly _resourceFetcher: ResourceFetcher

    public constructor(context: ExtensionContext, resourceFetcher: ResourceFetcher) {
        this._loadedRegions = []
        this._context = context
        this._resourceFetcher = resourceFetcher
    }

    // Returns an array of Regions, and caches them in memory.
    public async getRegionData(): Promise<RegionInfo[]> {
        const logger: Logger = getLogger()
        if (this._areRegionsLoaded) {
            return this._loadedRegions
        }

        let availableRegions: RegionInfo[] = []
        try {
            logger.info('> Downloading latest toolkits endpoint data')

            const resourcePath = path.join(this._context.extensionPath, 'resources', 'endpoints.json')
            const endpointsSource = await this._resourceFetcher.getResource([
                new WebResourceLocation(endpointsFileUrl),
                new FileResourceLocation(resourcePath)
            ])
            const allEndpoints = JSON.parse(endpointsSource) as RawEndpoints

            availableRegions = getRegionsFromEndpoints(allEndpoints)

            this._areRegionsLoaded = true
            this._loadedRegions = availableRegions
        } catch (err) {
            this._areRegionsLoaded = false
            logger.error('...error downloading endpoints: ', err as Error)
            // TODO: now what, oneline + local failed...?
            availableRegions = []
            this._loadedRegions = []
        }

        return availableRegions
    }
}

export function getRegionsFromPartition(partition: RawPartition): RegionInfo[] {
    return Object.keys(partition.regions).map(
        regionKey => new RegionInfo(regionKey, `${partition.regions[regionKey].description}`)
    )
}

export function getRegionsFromEndpoints(endpoints: RawEndpoints): RegionInfo[] {
    return endpoints.partitions
        // TODO : Support other Partition regions : https://github.com/aws/aws-toolkit-vscode/issues/188
        .filter(partition => partition.partition && partition.partition === 'aws')
        .reduce(
            (accumulator: RegionInfo[], partition: RawPartition) => {
                accumulator.push(...getRegionsFromPartition(partition))

                return accumulator
            },
            []
        )
}
