/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AwsContext } from '../awsContext'
import { Region } from './endpoints'
import { RegionProvider } from './regionProvider'

const DEFAULT_REGION = 'us-east-1'
const DEFAULT_PARTITION = 'aws'

export function getRegionsForActiveCredentials(awsContext: AwsContext, regionProvider: RegionProvider): Region[] {
    const defaultRegionId = awsContext.getCredentialDefaultRegion() ?? DEFAULT_REGION
    const partitionId = regionProvider.getPartitionId(defaultRegionId) ?? DEFAULT_PARTITION

    return regionProvider.getRegions(partitionId)
}
