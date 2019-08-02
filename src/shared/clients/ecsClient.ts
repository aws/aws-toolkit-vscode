/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export interface EcsClient {
    readonly regionCode: string

    listClusters(): AsyncIterableIterator<string>

    listServices(cluster: string): AsyncIterableIterator<string>

    listTaskDefinitions(): AsyncIterableIterator<string>
}
