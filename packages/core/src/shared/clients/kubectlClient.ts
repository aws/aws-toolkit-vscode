/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export interface HyperpodDevSpace {
    name: string
    namespace: string
    cluster: string
    environment: string
    application: string
    group: string
    version: string
    plural: string
    status: string
}

export interface HyperpodCluster {
    clusterName: string
    clusterArn: string
    status: string
    eksClusterName?: string
    eksClusterArn?: string
    regionCode: string
}

export class KubectlClient {
    public constructor() {
        // TODO: baseline
    }
}
