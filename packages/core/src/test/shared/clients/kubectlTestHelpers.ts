/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { HyperpodCluster, HyperpodDevSpace } from '../../../awsService/sagemaker/detached-server/hyperpodTypes'

export function createMockK8sSetup() {
    const mockDevSpace: HyperpodDevSpace = {
        name: 'test-space',
        namespace: 'test-namespace',
        cluster: 'test-cluster',
        group: 'workspace.jupyter.org',
        version: 'v1alpha1',
        plural: 'workspaces',
        status: 'Stopped',
        appType: 'jupyterlab',
        creator: 'test-user',
        accessType: 'Public',
    }

    const mockHyperpodCluster: HyperpodCluster = {
        clusterName: 'test-cluster',
        clusterArn: 'arn:aws:sagemaker:us-east-1:123456789012:cluster/test-cluster',
        status: 'InService',
        regionCode: 'us-east-1',
    }

    return { mockDevSpace, mockHyperpodCluster }
}
