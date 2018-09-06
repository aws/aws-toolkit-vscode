'use strict';

import { RegionInfo } from "./regionHelpers";

// Provides AWS Region Information
export interface RegionProvider {
    fetchLatestRegionData(): Promise<RegionInfo[]>;
}
