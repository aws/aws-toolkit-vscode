'use strict';

import path = require('path');
import { ResourceFetcher } from "./resourceFetcher";
import { endpointsFileUrl } from './constants';
import { ext } from "./extensionGlobals";

export class RegionInfo {

    constructor(public regionCode: string, public regionName: string){
    }
}

export abstract class RegionHelpers {

    // Returns an object whose keys are the region codes (us-east-1 etc) and
    // the values are the long-form names.
    // TODO: implement some form of cache?
    public static async fetchLatestRegionData(): Promise<RegionInfo[]> {
        let availableRegions: RegionInfo[] = [];

        try {
            console.log('> Downloading latest toolkits endpoint data');

            const resourcePath = path.join(ext.context.extensionPath, 'resources', 'endpoints.json');
            const endpointsSource = await ResourceFetcher.fetchHostedResource(endpointsFileUrl, resourcePath);
            var allEndpoints = JSON.parse(endpointsSource);

            for (var p = 0; p < allEndpoints.partitions.length; p++) {
                var partition = allEndpoints.partitions[p];

                var regionKeys = Object.keys(partition.regions);
                regionKeys.forEach((rk) => {
                    availableRegions.push(new RegionInfo(rk, `${partition.regions[rk].description}`));
                });
            }
        } catch (err) {
            console.log(`...error downloading endpoints: ${err}`); // TODO: now what, oneline + local failed...?
        }

        return availableRegions;
    }

}