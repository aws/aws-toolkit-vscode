/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ECS } from 'aws-sdk'

export interface EcsClient {
    readonly regionCode: string

    listClusters(): AsyncIterableIterator<ECS.String>

    listServices(cluster: string): AsyncIterableIterator<ECS.String>

    listTaskDefinitions(): AsyncIterableIterator<ECS.String>
}
