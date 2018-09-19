'use strict'

import { RegionInfo } from "./regionInfo"

// Provides AWS Region Information
export interface RegionProvider {
    // Returns an array of Regions
    getRegionData(): Promise<RegionInfo[]>
}
