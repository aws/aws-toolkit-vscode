/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export const DocDBContext = {
    Cluster: 'awsDocDB-cluster',
    ClusterRunning: 'awsDocDB-cluster-running',
    ClusterStopped: 'awsDocDB-cluster-stopped',
    ElasticClusterRunning: 'awsDocDB-cluster-elastic-running',
    ElasticClusterStopped: 'awsDocDB-cluster-elastic-stopped',
    Instance: 'awsDocDB-instance',
    InstanceAvailable: 'awsDocDB-instance-available',
} as const

export type DocDBNodeContext = (typeof DocDBContext)[keyof typeof DocDBContext]
