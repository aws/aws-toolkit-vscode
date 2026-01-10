/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'

/**
 * Creates a mock extension context for SageMaker Unified Studio tests
 */
export function createMockExtensionContext(): any {
    return {
        subscriptions: [],
        workspaceState: {
            get: sinon.stub(),
            update: sinon.stub(),
        },
        globalState: {
            get: sinon.stub(),
            update: sinon.stub(),
        },
    }
}

/**
 * Creates a mock S3 connection for SageMaker Unified Studio tests
 */
export function createMockS3Connection() {
    return {
        connectionId: 'conn-123',
        name: 'project.s3_default_folder',
        type: 'S3Connection',
        props: {
            s3Properties: {
                s3Uri: 's3://test-bucket/domain/project/',
            },
        },
    }
}

/**
 * Creates a mock credentials provider for SageMaker Unified Studio tests
 */
export function createMockCredentialsProvider() {
    return {
        getCredentials: async () => ({
            accessKeyId: 'test-key',
            secretAccessKey: 'test-secret',
        }),
        getDomainAccountId: async () => '123456789012',
    }
}
/**
 * Creates a mock unauthenticated auth provider for SageMaker Unified Studio tests
 */
export function createMockUnauthenticatedAuthProvider(): any {
    return {
        isConnected: sinon.stub().returns(false),
        isConnectionValid: sinon.stub().returns(false),
        activeConnection: undefined,
        onDidChange: sinon.stub().returns({ dispose: sinon.stub() }),
    }
} /**
 *
 Creates a mock space node for SageMaker Unified Studio tests
 */
export function createMockSpaceNode(): any {
    const mockParent = {
        getAuthProvider: sinon.stub().returns({
            activeConnection: { domainId: 'test-domain' },
            getDomainAccountId: sinon.stub().resolves('123456789012'),
            getDomainId: sinon.stub().returns('test-domain'),
        }),
        getProjectId: sinon.stub().returns('test-project'),
    }

    return {
        resource: {
            sageMakerClient: {},
            DomainSpaceKey: 'test-space-key',
            regionCode: 'us-east-1',
            getParent: sinon.stub().returns(mockParent),
        },
        getParent: sinon.stub().returns(mockParent),
    }
}
