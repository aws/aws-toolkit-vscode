/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AwsContext } from '../awsContext'
import { Region } from './endpoints'
import { RegionProvider } from './regionProvider'

export const DEFAULT_REGION = 'us-east-1'
export const DEFAULT_PARTITION = 'aws'
export const DEFAULT_DNS_SUFFIX = 'amazonaws.com'

export function getRegionsForActiveCredentials(awsContext: AwsContext, regionProvider: RegionProvider): Region[] {
    const defaultRegionId = awsContext.getCredentialDefaultRegion() ?? DEFAULT_REGION
    const partitionId = regionProvider.getPartitionId(defaultRegionId) ?? DEFAULT_PARTITION

    return regionProvider.getRegions(partitionId)
}
