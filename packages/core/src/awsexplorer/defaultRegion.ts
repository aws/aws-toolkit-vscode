/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AwsExplorer } from './awsExplorer'
import { RegionProvider } from '../shared/regions/regionProvider'

export async function checkExplorerForDefaultRegion(
    regionProvider: RegionProvider,
    awsExplorer: AwsExplorer
): Promise<void> {
    const profileRegion = regionProvider.defaultRegionId

    const explorerRegions = new Set(regionProvider.getExplorerRegions())
    if (explorerRegions.has(profileRegion)) {
        return
    }

    await regionProvider.updateExplorerRegions([...explorerRegions, profileRegion])
    awsExplorer.refresh()
}
