/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { SageMakerUnifiedStudioDataNode } from '../../../../sagemakerunifiedstudio/explorer/nodes/sageMakerUnifiedStudioDataNode'
import { SageMakerUnifiedStudioProjectNode } from '../../../../sagemakerunifiedstudio/explorer/nodes/sageMakerUnifiedStudioProjectNode'
import { DataZoneClient, DataZoneProject } from '../../../../sagemakerunifiedstudio/shared/client/datazoneClient'
import { SmusAuthenticationProvider } from '../../../../sagemakerunifiedstudio/auth/providers/smusAuthenticationProvider'
import * as s3Strategy from '../../../../sagemakerunifiedstudio/explorer/nodes/s3Strategy'
import * as redshiftStrategy from '../../../../sagemakerunifiedstudio/explorer/nodes/redshiftStrategy'

describe('SageMakerUnifiedStudioDataNode', function () {
    let sandbox: sinon.SinonSandbox
    let dataNode: SageMakerUnifiedStudioDataNode
    let mockParent: sinon.SinonStubbedInstance<SageMakerUnifiedStudioProjectNode>
    let mockDataZoneClient: sinon.SinonStubbedInstance<DataZoneClient>
    let mockAuthProvider: sinon.SinonStubbedInstance<SmusAuthenticationProvider>
    let mockProjectCredentialProvider: any

    const mockProject: DataZoneProject = {
        id: 'project-123',
        name: 'Test Project',
        domainId: 'domain-123',
    }

    const mockCredentials = {
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret',
        sessionToken: 'test-token',
        $metadata: {},
    }

    beforeEach(function () {
        sandbox = sinon.createSandbox()

        mockParent = {
            getProject: sandbox.stub().returns(mockProject),
        } as any

        mockProjectCredentialProvider = {
            getCredentials: sandbox.stub().resolves(mockCredentials),
        }

        mockAuthProvider = {
            getProjectCredentialProvider: sandbox.stub().resolves(mockProjectCredentialProvider),
            getDomainRegion: sandbox.stub().returns('us-east-1'),
        } as any

        mockDataZoneClient = {
            getInstance: sandbox.stub(),
            getProjectDefaultEnvironmentCreds: sandbox.stub(),
            listConnections: sandbox.stub(),
            getConnection: sandbox.stub(),
            getRegion: sandbox.stub().returns('us-east-1'),
        } as any

        sandbox.stub(DataZoneClient, 'getInstance').returns(mockDataZoneClient as any)
        sandbox.stub(SmusAuthenticationProvider, 'fromContext').returns(mockAuthProvider as any)
        sandbox.stub(s3Strategy, 'createS3ConnectionNode').returns({} as any)
        sandbox.stub(redshiftStrategy, 'createRedshiftConnectionNode').returns({} as any)

        dataNode = new SageMakerUnifiedStudioDataNode(mockParent as any)
    })

    afterEach(function () {
        sandbox.restore()
    })

    describe('constructor', function () {
        it('should initialize with correct properties', function () {
            assert.strictEqual(dataNode.id, 'smusDataFolder')
            assert.deepStrictEqual(dataNode.resource, {})
        })

        it('should initialize with provided children', function () {
            const initialChildren = [{ id: 'child1' } as any]
            const nodeWithChildren = new SageMakerUnifiedStudioDataNode(mockParent as any, initialChildren)
            // Children should be cached
            assert.ok(nodeWithChildren)
        })
    })

    describe('getTreeItem', function () {
        it('should return correct tree item', function () {
            const treeItem = dataNode.getTreeItem()

            assert.strictEqual(treeItem.label, 'Data')
            assert.strictEqual(treeItem.collapsibleState, vscode.TreeItemCollapsibleState.Collapsed)
            assert.strictEqual(treeItem.contextValue, 'dataFolder')
        })
    })

    describe('getParent', function () {
        it('should return parent node', function () {
            assert.strictEqual(dataNode.getParent(), mockParent)
        })
    })

    describe('getChildren', function () {
        it('should return cached children if available', async function () {
            const initialChildren = [{ id: 'cached' } as any]
            const nodeWithCache = new SageMakerUnifiedStudioDataNode(mockParent as any, initialChildren)

            const children = await nodeWithCache.getChildren()
            assert.strictEqual(children, initialChildren)
        })

        it('should return error node when no project available', async function () {
            mockParent.getProject.returns(undefined)

            const children = await dataNode.getChildren()

            assert.strictEqual(children.length, 1)
            assert.strictEqual(children[0].id, 'error-node')
        })

        it('should return error node when credentials are missing', async function () {
            mockProjectCredentialProvider.getCredentials.resolves(undefined)

            const children = await dataNode.getChildren()

            assert.strictEqual(children.length, 1)
            assert.strictEqual(children[0].id, 'error-node')
        })

        it('should return empty array when no connections found', async function () {
            mockDataZoneClient.listConnections.resolves([])

            const children = await dataNode.getChildren()

            assert.strictEqual(children.length, 0)
        })

        it('should create S3 and Redshift nodes for connections', async function () {
            const mockConnections = [
                { connectionId: 's3-conn', type: 'S3' },
                { connectionId: 'redshift-conn', type: 'REDSHIFT' },
            ]

            mockDataZoneClient.listConnections.resolves(mockConnections as any)
            mockDataZoneClient.getConnection.resolves({
                connectionCredentials: mockCredentials,
                connectionId: '',
                name: '',
                type: '',
                domainId: '',
                projectId: '',
            })

            const children = await dataNode.getChildren()

            assert.strictEqual(children.length, 2)
            assert.ok((s3Strategy.createS3ConnectionNode as sinon.SinonStub).calledOnce)
            assert.ok((redshiftStrategy.createRedshiftConnectionNode as sinon.SinonStub).calledOnce)
        })

        it('should handle connection detail errors gracefully', async function () {
            const mockConnections = [{ connectionId: 's3-conn', type: 'S3' }]

            mockDataZoneClient.listConnections.resolves(mockConnections as any)
            mockDataZoneClient.getConnection.rejects(new Error('Connection error'))

            const children = await dataNode.getChildren()

            assert.strictEqual(children.length, 1)
            assert.ok((s3Strategy.createS3ConnectionNode as sinon.SinonStub).calledOnce)
        })

        it('should return error node when general error occurs', async function () {
            mockAuthProvider.getProjectCredentialProvider.rejects(new Error('General error'))

            const children = await dataNode.getChildren()

            assert.strictEqual(children.length, 1)
            assert.strictEqual(children[0].id, 'error-node')
        })
    })
})
