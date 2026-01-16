/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import * as k8s from '@kubernetes/client-node'

export function createMockK8sSetup() {
    const mockK8sApi = sinon.createStubInstance(k8s.CustomObjectsApi)
    const mockDevSpace = {
        name: 'test-space',
        namespace: 'test-namespace',
        cluster: 'test-cluster',
        group: 'sagemaker.aws.amazon.com',
        version: 'v1',
        plural: 'devspaces',
        status: 'Stopped',
        appType: 'jupyterlab',
        creator: 'test-user',
        accessType: 'Public',
    }
    const mockHyperpodCluster = {
        clusterName: 'test-cluster',
        clusterArn: 'arn:aws:sagemaker:us-east-2:123456789012:cluster/test-cluster',
        status: 'InService',
        regionCode: 'us-east-2',
    }

    return { mockK8sApi, mockDevSpace, mockHyperpodCluster }
}

export function setupMockDevSpaceNode(mockDevSpaceNode: any) {
    const mockParent = { trackPendingNode: sinon.stub() }
    mockDevSpaceNode.getParent.returns(mockParent as any)
    mockDevSpaceNode.getDevSpaceKey.returns('test-key')
    return mockParent
}
