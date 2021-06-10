/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ECS } from "aws-sdk";

export interface EcsClient {
    readonly regionCode: string

    listClusters(): Promise<ECS.ListClustersResponse>

    listServices(cluster: string): AsyncIterableIterator<string>

    listTaskDefinitionFamilies(): AsyncIterableIterator<string>
}
