/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export interface EndpointsManifest {
    partitions: Partition[]
}

export interface Partition {
    partition: string
    partitionName: string
    regions: {
        [key: string]: PartitionRegion
    }
    services: {
        [key: string]: PartitionService
    }
}

export interface PartitionRegion {
    description: string
}

export interface PartitionService {
    endpoints: {
        [key: string]: any
    }
    isRegionalized?: boolean
    partitionEndpoint?: string
}
