/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import sinon from 'sinon'
import * as vscode from 'vscode'
import { SageMakerUnifiedStudioSpacesParentNode } from '../../../../sagemakerunifiedstudio/explorer/nodes/sageMakerUnifiedStudioSpacesParentNode'
import { SageMakerUnifiedStudioComputeNode } from '../../../../sagemakerunifiedstudio/explorer/nodes/sageMakerUnifiedStudioComputeNode'
import { SagemakerUnifiedStudioSpaceNode } from '../../../../sagemakerunifiedstudio/explorer/nodes/sageMakerUnifiedStudioSpaceNode'
import { DataZoneClient } from '../../../../sagemakerunifiedstudio/shared/client/datazoneClient'
import { SagemakerClient } from '../../../../shared/clients/sagemaker'
import { SmusAuthenticationProvider } from '../../../../sagemakerunifiedstudio/auth/providers/smusAuthenticationProvider'
import { getLogger } from '../../../../shared/logger/logger'

describe('SageMakerUnifiedStudioSpacesParentNode', function () {
    let spacesNode: SageMakerUnifiedStudioSpacesParentNode
    let mockParent: SageMakerUnifiedStudioComputeNode
    let mockExtensionContext: vscode.ExtensionContext
    let mockAuthProvider: SmusAuthenticationProvider
    let mockSagemakerClient: SagemakerClient
    let mockDataZoneClient: sinon.SinonStubbedInstance<DataZoneClient>

    beforeEach(function () {
        mockParent = {} as any
        mockExtensionContext = {
            extensionUri: vscode.Uri.file('/test'),
        } as any
        mockAuthProvider = {
            activeConnection: { domainId: 'test-domain', ssoRegion: 'us-west-2' },
        } as any
        mockSagemakerClient = {
            fetchSpaceAppsAndDomains: sinon.stub(),
        } as any

        mockDataZoneClient = {
            getInstance: sinon.stub(),
            getUserId: sinon.stub(),
            getDomainId: sinon.stub(),
            getRegion: sinon.stub(),
            getToolingEnvironmentId: sinon.stub(),
            getEnvironmentDetails: sinon.stub(),
        } as any

        sinon.stub(DataZoneClient, 'getInstance').resolves(mockDataZoneClient as any)
        sinon.stub(getLogger(), 'debug')
        sinon.stub(getLogger(), 'error')

        spacesNode = new SageMakerUnifiedStudioSpacesParentNode(
            mockParent,
            'project-123',
            mockExtensionContext,
            mockAuthProvider,
            mockSagemakerClient
        )
    })

    afterEach(function () {
        spacesNode.pollingSet.clear()
        sinon.restore()
    })

    describe('constructor', function () {
        it('creates instance with correct properties', function () {
            assert.strictEqual(spacesNode.id, 'smusSpacesParentNode')
            assert.strictEqual(spacesNode.resource, spacesNode)
        })
    })

    describe('getTreeItem', function () {
        it('returns correct tree item', async function () {
            const treeItem = await spacesNode.getTreeItem()

            assert.strictEqual(treeItem.label, 'Spaces')
            assert.strictEqual(treeItem.collapsibleState, vscode.TreeItemCollapsibleState.Expanded)
            assert.strictEqual(treeItem.contextValue, 'smusSpacesNode')
            assert.ok(treeItem.iconPath)
        })
    })

    describe('getParent', function () {
        it('returns parent node', function () {
            const parent = spacesNode.getParent()
            assert.strictEqual(parent, mockParent)
        })
    })

    describe('getProjectId', function () {
        it('returns project ID', function () {
            assert.strictEqual(spacesNode.getProjectId(), 'project-123')
        })
    })

    describe('getAuthProvider', function () {
        it('returns auth provider', function () {
            assert.strictEqual(spacesNode.getAuthProvider(), mockAuthProvider)
        })
    })

    describe('refreshNode', function () {
        it('fires change event', async function () {
            const emitterSpy = sinon.spy(spacesNode['onDidChangeEmitter'], 'fire')
            await spacesNode.refreshNode()
            assert(emitterSpy.calledOnce)
        })
    })

    describe('trackPendingNode', function () {
        it('adds node to polling set', function () {
            const addSpy = sinon.spy(spacesNode.pollingSet, 'add')
            spacesNode.trackPendingNode('test-key')
            assert(addSpy.calledWith('test-key'))
        })
    })

    describe('getSpaceNodes', function () {
        it('returns space node when found', function () {
            const mockSpaceNode = {} as SagemakerUnifiedStudioSpaceNode
            spacesNode['sagemakerSpaceNodes'].set('test-key', mockSpaceNode)

            const result = spacesNode.getSpaceNodes('test-key')
            assert.strictEqual(result, mockSpaceNode)
        })

        it('throws error when node not found', function () {
            assert.throws(
                () => spacesNode.getSpaceNodes('non-existent'),
                /Node with id non-existent from polling set not found/
            )
        })
    })

    describe('getSageMakerDomainId', function () {
        it('throws error when no active connection', async function () {
            const mockAuthProviderNoConnection = {
                activeConnection: undefined,
            } as any

            const spacesNodeNoConnection = new SageMakerUnifiedStudioSpacesParentNode(
                mockParent,
                'project-123',
                mockExtensionContext,
                mockAuthProviderNoConnection,
                mockSagemakerClient
            )

            await assert.rejects(
                async () => await spacesNodeNoConnection.getSageMakerDomainId(),
                /No active connection found to get SageMaker domain ID/
            )
        })

        it('throws error when DataZone client not initialized', async function () {
            ;(DataZoneClient.getInstance as sinon.SinonStub).resolves(undefined)

            await assert.rejects(
                async () => await spacesNode.getSageMakerDomainId(),
                /DataZone client is not initialized/
            )
        })

        it('throws error when tooling environment ID not found', async function () {
            mockDataZoneClient.getDomainId.returns('domain-123')
            mockDataZoneClient.getToolingEnvironmentId.rejects(new Error('Environment not found'))

            await assert.rejects(
                async () => await spacesNode.getSageMakerDomainId(),
                /Failed to get tooling environment ID: Environment not found/
            )
        })

        it('throws error when no default environment found', async function () {
            mockDataZoneClient.getDomainId.returns('domain-123')
            mockDataZoneClient.getToolingEnvironmentId.resolves(undefined)

            await assert.rejects(
                async () => await spacesNode.getSageMakerDomainId(),
                /No default environment found for project/
            )
        })

        it('throws error when SageMaker domain ID not found in resources', async function () {
            mockDataZoneClient.getDomainId.returns('domain-123')
            mockDataZoneClient.getToolingEnvironmentId.resolves('env-123')
            mockDataZoneClient.getEnvironmentDetails.resolves({
                projectId: 'project-123',
                domainId: 'domain-123',
                createdBy: 'user',
                name: 'test-env',
                provisionedResources: [{ name: 'otherResource', value: 'value', type: 'OTHER' }],
            } as any)

            await assert.rejects(
                async () => await spacesNode.getSageMakerDomainId(),
                /No SageMaker domain found in the tooling environment/
            )
        })

        it('returns SageMaker domain ID when found', async function () {
            mockDataZoneClient.getDomainId.returns('domain-123')
            mockDataZoneClient.getToolingEnvironmentId.resolves('env-123')
            mockDataZoneClient.getEnvironmentDetails.resolves({
                projectId: 'project-123',
                domainId: 'domain-123',
                createdBy: 'user',
                name: 'test-env',
                provisionedResources: [
                    {
                        name: 'sageMakerDomainId',
                        value: 'sagemaker-domain-123',
                        type: 'SAGEMAKER_DOMAIN',
                    },
                ],
            } as any)

            const result = await spacesNode.getSageMakerDomainId()
            assert.strictEqual(result, 'sagemaker-domain-123')
        })
    })

    describe('getChildren', function () {
        let updateChildrenStub: sinon.SinonStub
        let mockSpaceNode1: SagemakerUnifiedStudioSpaceNode
        let mockSpaceNode2: SagemakerUnifiedStudioSpaceNode

        beforeEach(function () {
            updateChildrenStub = sinon.stub(spacesNode as any, 'updateChildren').resolves()
            mockSpaceNode1 = {} as SagemakerUnifiedStudioSpaceNode
            mockSpaceNode2 = {} as SagemakerUnifiedStudioSpaceNode
        })

        it('calls updateChildren and returns space nodes', async function () {
            spacesNode['sagemakerSpaceNodes'].set('space1', mockSpaceNode1)
            spacesNode['sagemakerSpaceNodes'].set('space2', mockSpaceNode2)

            const result = await spacesNode.getChildren()

            assert(updateChildrenStub.calledOnce)
            assert.strictEqual(result.length, 2)
            assert(result.includes(mockSpaceNode1))
            assert(result.includes(mockSpaceNode2))
        })

        it('returns empty array when no space nodes exist', async function () {
            const result = await spacesNode.getChildren()

            assert(updateChildrenStub.calledOnce)
            assert.strictEqual(result.length, 0)
        })

        it('propagates error from updateChildren', async function () {
            const error = new Error('Update failed')
            updateChildrenStub.rejects(error)

            await assert.rejects(async () => await spacesNode.getChildren(), /Update failed/)
        })
    })

    describe('updatePendingSpaceNode', function () {
        let mockSpaceNode: sinon.SinonStubbedInstance<SagemakerUnifiedStudioSpaceNode>

        beforeEach(function () {
            mockSpaceNode = {
                updateSpaceAppStatus: sinon.stub().resolves(),
                isPending: sinon.stub(),
                refreshNode: sinon.stub().resolves(),
                DomainSpaceKey: 'test-key',
            } as any
        })

        it('updates space app status and refreshes when not pending', async function () {
            mockSpaceNode.isPending.returns(false)
            const deleteSpy = sinon.spy(spacesNode.pollingSet, 'delete')

            await spacesNode['updatePendingSpaceNode'](mockSpaceNode as any)

            assert(mockSpaceNode.updateSpaceAppStatus.calledOnce)
            assert(mockSpaceNode.isPending.calledOnce)
            assert(deleteSpy.calledWith('test-key'))
            assert(mockSpaceNode.refreshNode.calledOnce)
        })

        it('updates space app status but does not refresh when still pending', async function () {
            mockSpaceNode.isPending.returns(true)
            const deleteSpy = sinon.spy(spacesNode.pollingSet, 'delete')

            await spacesNode['updatePendingSpaceNode'](mockSpaceNode as any)

            assert(mockSpaceNode.updateSpaceAppStatus.calledOnce)
            assert(mockSpaceNode.isPending.calledOnce)
            assert(deleteSpy.notCalled)
            assert(mockSpaceNode.refreshNode.notCalled)
        })
    })

    describe('updateChildren', function () {
        let getSageMakerDomainIdStub: sinon.SinonStub
        let extractSSOIdStub: sinon.SinonStub
        let updateInPlaceStub: sinon.SinonStub

        beforeEach(function () {
            getSageMakerDomainIdStub = sinon.stub(spacesNode, 'getSageMakerDomainId').resolves('domain-123')
            extractSSOIdStub = sinon.stub(spacesNode as any, 'extractSSOIdFromUserId').returns('user-123')
            updateInPlaceStub = sinon.stub(require('../../../../shared/utilities/collectionUtils'), 'updateInPlace')

            mockDataZoneClient.getUserId.resolves('ABCA4NU3S7PEOLDQPLXYZ:user-user-123')
            mockDataZoneClient.getRegion.returns('us-west-2')
            ;(mockSagemakerClient.fetchSpaceAppsAndDomains as sinon.SinonStub).resolves([
                new Map([
                    [
                        'space1',
                        { DomainId: 'domain-123', OwnershipSettingsSummary: { OwnerUserProfileName: 'user-123' } },
                    ],
                ]),
                new Map([['domain-123', { DomainId: 'domain-123' }]]),
            ])
        })

        it('successfully updates children with filtered space apps', async function () {
            await spacesNode['updateChildren']()

            assert(mockDataZoneClient.getUserId.calledOnce)
            assert(extractSSOIdStub.calledWith('ABCA4NU3S7PEOLDQPLXYZ:user-user-123'))
            assert(getSageMakerDomainIdStub.calledOnce)
            assert((mockSagemakerClient.fetchSpaceAppsAndDomains as sinon.SinonStub).calledWith('domain-123', false))
            assert(updateInPlaceStub.calledOnce)
        })

        it('filters out spaces not owned by current user', async function () {
            ;(mockSagemakerClient.fetchSpaceAppsAndDomains as sinon.SinonStub).resolves([
                new Map([
                    [
                        'space1',
                        { DomainId: 'domain-123', OwnershipSettingsSummary: { OwnerUserProfileName: 'user-123' } },
                    ],
                    [
                        'space2',
                        { DomainId: 'domain-123', OwnershipSettingsSummary: { OwnerUserProfileName: 'other-user' } },
                    ],
                ]),
                new Map([['domain-123', { DomainId: 'domain-123' }]]),
            ])

            await spacesNode['updateChildren']()

            assert.strictEqual(spacesNode['spaceApps'].size, 1)
            assert(spacesNode['spaceApps'].has('space1'))
            assert(!spacesNode['spaceApps'].has('space2'))
        })
    })

    describe('extractSSOIdFromUserId', function () {
        it('extracts SSO ID from valid user ID', function () {
            const result = spacesNode['extractSSOIdFromUserId'](
                'ABCA4NU3S7PEOLDQPLXYZ:user-12345678-d061-70a4-0bf2-eeee67a6ab12'
            )
            assert.strictEqual(result, '12345678-d061-70a4-0bf2-eeee67a6ab12')
        })

        it('throws error for invalid user ID format', function () {
            assert.throws(
                () => spacesNode['extractSSOIdFromUserId']('invalid-format'),
                /Invalid UserId format: invalid-format/
            )
        })
    })
})
