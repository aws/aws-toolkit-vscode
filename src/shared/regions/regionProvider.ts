/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { RegionInfo } from './regionInfo'

// Provides AWS Region Information
export interface RegionProvider {
    // Returns an array of Regions
    getRegionData(): Promise<RegionInfo[]>
}
