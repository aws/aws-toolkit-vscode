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
import { SmusUtils, SmusErrorCodes } from '../../../../sagemakerunifiedstudio/shared/smusUtils'
import { ToolkitError } from '../../../../shared/errors'
import * as vscodeUtils from '../../../../shared/vscode/setContext'
import * as utils from '../../../../sagemakerunifiedstudio/explorer/nodes/utils'
import { DataZoneCustomClientHelper } from '../../../../sagemakerunifiedstudio/shared/client/datazoneCustomClientHelper'

describe('SageMakerUnifiedStudioSpacesParentNode', function () {
    let spacesNode: SageMakerUnifiedStudioSpacesParentNode
    let mockParent: SageMakerUnifiedStudioComputeNode
    let mockExtensionContext: vscode.ExtensionContext
    let mockAuthProvider: SmusAuthenticationProvider
    let mockSagemakerClient: sinon.SinonStubbedInstance<SagemakerClient>
    let mockDataZoneClient: sinon.SinonStubbedInstance<DataZoneClient>

    beforeEach(function () {
        mockParent = {} as any
        mockExtensionContext = {
            extensionUri: vscode.Uri.file('/test'),
        } as any
        mockAuthProvider = {
            activeConnection: { domainId: 'test-domain', ssoRegion: 'us-west-2', profileName: 'test-profile' },
            getDomainId: sinon.stub().returns('test-domain'),
            getDomainRegion: sinon.stub().returns('us-west-2'),
            getIamPrincipalArn: sinon.stub().resolves(undefined),
            getDerCredentialsProvider: sinon.stub().resolves({
                getCredentials: sinon.stub().resolves({
                    accessKeyId: 'test-key',
                    secretAccessKey: 'test-secret',
                    sessionToken: 'test-token',
                }),
            }),
            getCredentialsProviderForIamProfile: sinon.stub().resolves({
                getCredentials: sinon.stub().resolves({
                    accessKeyId: 'test-key',
                    secretAccessKey: 'test-secret',
                    sessionToken: 'test-token',
                }),
            }),
        } as any
        mockSagemakerClient = sinon.createStubInstance(SagemakerClient)
        mockSagemakerClient.fetchSpaceAppsAndDomains.resolves([new Map(), new Map()])

        mockDataZoneClient = {
            getInstance: sinon.stub(),
            getUserId: sinon.stub(),
            getDomainId: sinon.stub(),
            getRegion: sinon.stub(),
            getToolingEnvironmentId: sinon.stub(),
            getEnvironmentDetails: sinon.stub(),
            getToolingEnvironment: sinon.stub(),
        } as any

        sinon.stub(DataZoneClient, 'createWithCredentials').resolves(mockDataZoneClient as any)
        sinon.stub(getLogger(), 'debug')
        sinon.stub(getLogger(), 'error')
        sinon.stub(SmusUtils, 'extractSSOIdFromUserId').returns('user-12345')
        sinon.stub(vscodeUtils, 'getContext').returns(false)

        spacesNode = new SageMakerUnifiedStudioSpacesParentNode(
            mockParent,
            'project-123',
            mockExtensionContext,
            mockAuthProvider,
            mockSagemakerClient as any
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
                mockSagemakerClient as any
            )

            await assert.rejects(
                async () => await spacesNodeNoConnection.getSageMakerDomainId(),
                /No active connection found to get SageMaker domain ID/
            )
        })

        it('throws error when DataZone client not initialized', async function () {
            ;(DataZoneClient.createWithCredentials as sinon.SinonStub).resolves(undefined)

            await assert.rejects(
                async () => await spacesNode.getSageMakerDomainId(),
                /DataZone client is not initialized/
            )
        })

        it('throws error when tooling environment ID not found', async function () {
            mockDataZoneClient.getDomainId.returns('domain-123')
            const error = new Error('Failed to get tooling environment ID: Environment not found')
            mockDataZoneClient.getToolingEnvironment.rejects(error)

            await assert.rejects(
                async () => await spacesNode.getSageMakerDomainId(),
                /Failed to get tooling environment ID: Environment not found/
            )
        })

        it('throws error when no default environment found', async function () {
            mockDataZoneClient.getDomainId.returns('domain-123')
            const error = new Error('No default environment found for project')
            mockDataZoneClient.getToolingEnvironment.rejects(error)

            await assert.rejects(
                async () => await spacesNode.getSageMakerDomainId(),
                /No default environment found for project/
            )
        })

        it('throws error when SageMaker domain ID not found in resources', async function () {
            mockDataZoneClient.getDomainId.returns('domain-123')
            mockDataZoneClient.getToolingEnvironment.resolves({
                projectId: 'project-123',
                domainId: 'domain-123',
                createdBy: 'user',
                name: 'test-env',
                awsAccountRegion: 'us-west-2',
                provisionedResources: [{ name: 'otherResource', value: 'value', type: 'OTHER' }],
            } as any)

            await assert.rejects(
                async () => await spacesNode.getSageMakerDomainId(),
                /No SageMaker domain found in the tooling environment/
            )
        })

        it('returns SageMaker domain ID when found', async function () {
            mockDataZoneClient.getDomainId.returns('domain-123')
            mockDataZoneClient.getToolingEnvironment.resolves({
                projectId: 'project-123',
                domainId: 'domain-123',
                createdBy: 'user',
                name: 'test-env',
                awsAccountRegion: 'us-west-2',
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
            mockSpaceNode1 = { id: 'space1' } as any
            mockSpaceNode2 = { id: 'space2' } as any
        })

        it('returns space nodes when spaces exist', async function () {
            spacesNode['sagemakerSpaceNodes'].set('space1', mockSpaceNode1)
            spacesNode['sagemakerSpaceNodes'].set('space2', mockSpaceNode2)

            const children = await spacesNode.getChildren()

            assert.strictEqual(children.length, 2)
            assert(children.includes(mockSpaceNode1))
            assert(children.includes(mockSpaceNode2))
            assert(updateChildrenStub.calledOnce)
        })

        it('returns no spaces found node when no spaces exist', async function () {
            const children = await spacesNode.getChildren()

            assert.strictEqual(children.length, 1)
            const noSpacesNode = children[0]
            assert.strictEqual(noSpacesNode.id, 'smusNoSpaces')

            const treeItem = await noSpacesNode.getTreeItem()
            assert.strictEqual(treeItem.label, '[No Spaces found]')
            assert.strictEqual(treeItem.collapsibleState, vscode.TreeItemCollapsibleState.None)
        })

        it('returns no spaces found node when updateChildren throws error', async function () {
            updateChildrenStub.rejects(new Error('Update failed'))

            const children = await spacesNode.getChildren()

            assert.strictEqual(children.length, 1)
            assert.strictEqual(children[0].id, 'smusNoSpaces')
        })

        it('returns access denied node when AccessDeniedException is thrown', async function () {
            const accessDeniedError = new Error('Access denied')
            accessDeniedError.name = 'AccessDeniedException'
            updateChildrenStub.rejects(accessDeniedError)

            const children = await spacesNode.getChildren()

            assert.strictEqual(children.length, 1)
            const accessDeniedNode = children[0]
            assert.strictEqual(accessDeniedNode.id, 'smusAccessDenied')

            const treeItem = await accessDeniedNode.getTreeItem()
            assert.ok(treeItem)
            assert.strictEqual(
                treeItem.label,
                "You don't have permission to view spaces. Please contact your administrator."
            )
            assert.strictEqual(treeItem.collapsibleState, vscode.TreeItemCollapsibleState.None)
            assert.ok(treeItem.iconPath)
            assert.strictEqual((treeItem.iconPath as vscode.ThemeIcon).id, 'error')
        })
    })

    describe('updatePendingNodes', function () {
        it('updates pending space nodes and removes from polling set when not pending', async function () {
            const mockSpaceNode = {
                DomainSpaceKey: 'test-key',
                updateSpaceAppStatus: sinon.stub().resolves(),
                isPending: sinon.stub().returns(false),
                refreshNode: sinon.stub().resolves(),
            } as any

            spacesNode['sagemakerSpaceNodes'].set('test-key', mockSpaceNode)
            spacesNode.pollingSet.add('test-key')

            await spacesNode['updatePendingNodes']()

            assert(mockSpaceNode.updateSpaceAppStatus.calledOnce)
            assert(mockSpaceNode.refreshNode.calledOnce)
            assert(!spacesNode.pollingSet.has('test-key'))
        })

        it('keeps pending nodes in polling set', async function () {
            const mockSpaceNode = {
                DomainSpaceKey: 'test-key',
                updateSpaceAppStatus: sinon.stub().resolves(),
                isPending: sinon.stub().returns(true),
                refreshNode: sinon.stub().resolves(),
            } as any

            spacesNode['sagemakerSpaceNodes'].set('test-key', mockSpaceNode)
            spacesNode.pollingSet.add('test-key')

            await spacesNode['updatePendingNodes']()

            assert(mockSpaceNode.updateSpaceAppStatus.calledOnce)
            assert(mockSpaceNode.refreshNode.notCalled)
            assert(spacesNode.pollingSet.has('test-key'))
        })
    })

    describe('getAccessDeniedChildren', function () {
        it('returns access denied tree node with error icon', async function () {
            const accessDeniedChildren = spacesNode['getAccessDeniedChildren']()

            assert.strictEqual(accessDeniedChildren.length, 1)
            const accessDeniedNode = accessDeniedChildren[0]
            assert.strictEqual(accessDeniedNode.id, 'smusAccessDenied')

            const treeItem = await accessDeniedNode.getTreeItem()
            assert.ok(treeItem)
            assert.strictEqual(
                treeItem.label,
                "You don't have permission to view spaces. Please contact your administrator."
            )
            assert.strictEqual(treeItem.collapsibleState, vscode.TreeItemCollapsibleState.None)
            assert.ok(treeItem.iconPath)
            assert.strictEqual((treeItem.iconPath as vscode.ThemeIcon).id, 'error')
        })
    })

    describe('updateChildren', function () {
        beforeEach(function () {
            mockDataZoneClient.getUserId.resolves('ABCA4NU3S7PEOLDQPLXYZ:user-12345678-d061-70a4-0bf2-eeee67a6ab12')
            mockDataZoneClient.getDomainId.returns('domain-123')
            mockDataZoneClient.getRegion.returns('us-west-2')
            mockDataZoneClient.getToolingEnvironment.resolves({
                awsAccountRegion: 'us-west-2',
                provisionedResources: [{ name: 'sageMakerDomainId', value: 'sagemaker-domain-123' }],
            } as any)
        })

        it('filters spaces by current user ownership', async function () {
            const spaceApps = new Map([
                [
                    'space1',
                    {
                        DomainId: 'domain-123',
                        OwnershipSettingsSummary: { OwnerUserProfileName: 'user-12345' },
                        DomainSpaceKey: 'space1',
                    },
                ],
                [
                    'space2',
                    {
                        DomainId: 'domain-123',
                        OwnershipSettingsSummary: { OwnerUserProfileName: 'other-user' },
                        DomainSpaceKey: 'space2',
                    },
                ],
            ])
            const domains = new Map([['domain-123', { DomainId: 'domain-123' }]])

            mockSagemakerClient.fetchSpaceAppsAndDomains.resolves([spaceApps, domains])

            await spacesNode['updateChildren']()

            assert.strictEqual(spacesNode['spaceApps'].size, 1)
            assert(spacesNode['spaceApps'].has('space1'))
            assert(!spacesNode['spaceApps'].has('space2'))
        })

        it('creates space nodes for filtered spaces', async function () {
            const spaceApps = new Map([
                [
                    'space1',
                    {
                        DomainId: 'domain-123',
                        OwnershipSettingsSummary: { OwnerUserProfileName: 'user-12345' },
                        DomainSpaceKey: 'space1',
                    },
                ],
            ])
            const domains = new Map([['domain-123', { DomainId: 'domain-123' }]])

            mockSagemakerClient.fetchSpaceAppsAndDomains.resolves([spaceApps, domains])

            await spacesNode['updateChildren']()

            assert.strictEqual(spacesNode['sagemakerSpaceNodes'].size, 1)
            assert(spacesNode['sagemakerSpaceNodes'].has('space1'))
        })

        it('throws AccessDeniedException when fetchSpaceAppsAndDomains fails with access denied', async function () {
            const accessDeniedError = new Error('Access denied to spaces')
            accessDeniedError.name = 'AccessDeniedException'
            mockSagemakerClient.fetchSpaceAppsAndDomains.rejects(accessDeniedError)

            await assert.rejects(async () => await spacesNode['updateChildren'](), /Access denied to spaces/)
        })
    })

    describe('IAM mode error handling', function () {
        beforeEach(function () {
            // Add getIamPrincipalArn stub to mockAuthProvider
            mockAuthProvider.getIamPrincipalArn = sinon.stub().resolves('arn:aws:iam::123456789012:user/test-user')
        })

        it('should return no user profile error node when NoUserProfileFound error is thrown', async function () {
            const noProfileError = new ToolkitError('No user profile found for IAM principal', {
                code: SmusErrorCodes.NoUserProfileFound,
            })
            const updateChildrenStub = sinon.stub(spacesNode as any, 'updateChildren')
            updateChildrenStub.rejects(noProfileError)

            const children = await spacesNode.getChildren()

            assert.strictEqual(children.length, 1)
            assert.strictEqual(children[0].id, 'smusNoUserProfile')

            const treeItem = await children[0].getTreeItem()
            assert.strictEqual(treeItem.label, 'No spaces found for IAM principal')
        })

        it('should return no user profile error node when NoGroupProfileFound error is thrown', async function () {
            const noProfileError = new ToolkitError('No group profile found for IAM role', {
                code: SmusErrorCodes.NoGroupProfileFound,
            })
            const updateChildrenStub = sinon.stub(spacesNode as any, 'updateChildren')
            updateChildrenStub.rejects(noProfileError)

            const children = await spacesNode.getChildren()

            assert.strictEqual(children.length, 1)
            assert.strictEqual(children[0].id, 'smusNoUserProfile')

            const treeItem = await children[0].getTreeItem()
            assert.strictEqual(treeItem.label, 'No spaces found for IAM principal')
        })

        it('should return access denied error node when IAM mode returns AccessDeniedException', async function () {
            const accessDeniedError = new Error("You don't have permissions to access this resource")
            accessDeniedError.name = 'AccessDeniedException'
            const updateChildrenStub = sinon.stub(spacesNode as any, 'updateChildren')
            updateChildrenStub.rejects(accessDeniedError)

            const children = await spacesNode.getChildren()

            assert.strictEqual(children.length, 1)
            assert.strictEqual(children[0].id, 'smusAccessDenied')
        })

        it('should return user profile error node when IAM mode returns generic error', async function () {
            const genericError = new Error('Failed to retrieve user profile information')
            const updateChildrenStub = sinon.stub(spacesNode as any, 'updateChildren')
            updateChildrenStub.rejects(genericError)

            const children = await spacesNode.getChildren()

            assert.strictEqual(children.length, 1)
            assert.strictEqual(children[0].id, 'smusUserProfileError')

            const treeItem = await children[0].getTreeItem()
            assert.strictEqual(treeItem.label, 'Failed to retrieve spaces. Please try again.')
        })
    })

    describe('getUserProfileIdForIamAuthMode - IAM user flow', function () {
        let createDZClientStub: sinon.SinonStub
        let getContextStub: sinon.SinonStub

        beforeEach(function () {
            getContextStub = vscodeUtils.getContext as sinon.SinonStub
            getContextStub.withArgs('aws.smus.isIamMode').returns(true)
            createDZClientStub = sinon.stub(utils, 'createDZClientBaseOnDomainMode')
        })

        afterEach(function () {
            createDZClientStub.restore()
        })

        it('should use GetUserProfile API for IAM user', async function () {
            const mockUserArn = 'arn:aws:iam::123456789012:user/test-user'
            const mockUserProfileId = 'up_user123'

            mockAuthProvider.getIamPrincipalArn = sinon.stub().resolves(mockUserArn)
            mockAuthProvider.getDomainId = sinon.stub().returns('domain-123')

            const mockGetUserProfileId = sinon.stub().resolves(mockUserProfileId)
            mockDataZoneClient.getUserProfileIdForIamPrincipal = mockGetUserProfileId as any
            createDZClientStub.resolves(mockDataZoneClient)

            const result = await spacesNode['getUserProfileIdForIamAuthMode']()

            assert.strictEqual(result, mockUserProfileId)
            assert(mockGetUserProfileId.calledWith(mockUserArn, 'domain-123'))
        })

        it('should throw error when IAM user profile not found', async function () {
            const mockUserArn = 'arn:aws:iam::123456789012:user/test-user'

            mockAuthProvider.getIamPrincipalArn = sinon.stub().resolves(mockUserArn)
            mockAuthProvider.getDomainId = sinon.stub().returns('domain-123')

            mockDataZoneClient.getUserProfileIdForIamPrincipal = sinon.stub().resolves(undefined) as any
            createDZClientStub.resolves(mockDataZoneClient)

            await assert.rejects(
                async () => await spacesNode['getUserProfileIdForIamAuthMode'](),
                /No user profile found for IAM user/
            )
        })

        it('should throw error when caller ARN cannot be retrieved', async function () {
            mockAuthProvider.getIamPrincipalArn = sinon.stub().resolves(undefined)

            await assert.rejects(
                async () => await spacesNode['getUserProfileIdForIamAuthMode'](),
                /Unable to retrieve caller identity ARN/
            )
        })
    })

    describe('getUserProfileIdForIamAuthMode - IAM role session flow', function () {
        let mockDataZoneCustomClientHelper: any
        let getInstanceStub: sinon.SinonStub
        let getContextStub: sinon.SinonStub

        beforeEach(function () {
            getContextStub = vscodeUtils.getContext as sinon.SinonStub
            getContextStub.withArgs('aws.smus.isIamMode').returns(true)

            mockDataZoneCustomClientHelper = {
                getUserProfileIdForSession: sinon.stub(),
            }

            // Mock the DataZoneCustomClientHelper.getInstance
            getInstanceStub = sinon
                .stub(DataZoneCustomClientHelper, 'getInstance')
                .returns(mockDataZoneCustomClientHelper)
        })

        afterEach(function () {
            getInstanceStub.restore()
        })

        it('should use SearchUserProfile API for IAM role session', async function () {
            const mockRoleArn = 'arn:aws:iam::123456789012:role/TestRole'
            const mockAssumedRoleArn = 'arn:aws:sts::123456789012:assumed-role/TestRole/test-session'
            const mockUserProfileId = 'up_session123'

            mockAuthProvider.getIamPrincipalArn = sinon.stub().resolves(mockRoleArn)
            mockAuthProvider.getCachedIamCallerIdentityArn = sinon.stub().resolves(mockAssumedRoleArn)
            mockAuthProvider.getDomainId = sinon.stub().returns('domain-123')
            mockDataZoneCustomClientHelper.getUserProfileIdForSession.resolves(mockUserProfileId)

            const result = await spacesNode['getUserProfileIdForIamAuthMode']()

            assert.strictEqual(result, mockUserProfileId)
            assert(
                mockDataZoneCustomClientHelper.getUserProfileIdForSession.calledWith('domain-123', mockAssumedRoleArn)
            )
        })

        it('should throw error when assumed role ARN cannot be retrieved', async function () {
            const mockRoleArn = 'arn:aws:iam::123456789012:role/TestRole'

            mockAuthProvider.getIamPrincipalArn = sinon.stub().resolves(mockRoleArn)
            mockAuthProvider.getCachedIamCallerIdentityArn = sinon.stub().resolves(undefined)

            await assert.rejects(
                async () => await spacesNode['getUserProfileIdForIamAuthMode'](),
                /Unable to retrieve assumed role ARN with session/
            )
        })
    })
})
