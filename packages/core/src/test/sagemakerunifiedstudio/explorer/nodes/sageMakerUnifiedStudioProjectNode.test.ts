/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import sinon from 'sinon'
import * as vscode from 'vscode'
import { SageMakerUnifiedStudioProjectNode } from '../../../../sagemakerunifiedstudio/explorer/nodes/sageMakerUnifiedStudioProjectNode'
import { DataZoneClient, DataZoneProject } from '../../../../sagemakerunifiedstudio/shared/client/datazoneClient'
import { getLogger } from '../../../../shared/logger/logger'
import { telemetry } from '../../../../shared/telemetry/telemetry'
import { SagemakerClient } from '../../../../shared/clients/sagemaker'
import { SageMakerUnifiedStudioDataNode } from '../../../../sagemakerunifiedstudio/explorer/nodes/sageMakerUnifiedStudioDataNode'
import { SageMakerUnifiedStudioComputeNode } from '../../../../sagemakerunifiedstudio/explorer/nodes/sageMakerUnifiedStudioComputeNode'
import * as vscodeUtils from '../../../../shared/vscode/setContext'
import { createMockExtensionContext } from '../../testUtils'

describe('SageMakerUnifiedStudioProjectNode', function () {
    let projectNode: SageMakerUnifiedStudioProjectNode
    let mockDataZoneClient: sinon.SinonStubbedInstance<DataZoneClient>

    const mockProject: DataZoneProject = {
        id: 'project-123',
        name: 'Test Project',
        description: 'Test Description',
        domainId: 'domain-123',
    }

    beforeEach(function () {
        // Create mock parent
        const mockParent = {} as any

        // Create mock auth provider
        const mockAuthProvider = {
            activeConnection: { domainId: 'test-domain', ssoRegion: 'us-west-2' },
            invalidateAllProjectCredentialsInCache: sinon.stub(),
            getProjectCredentialProvider: sinon.stub(),
            getDomainRegion: sinon.stub().returns('us-west-2'),
            getDomainAccountId: sinon.stub().resolves('123456789012'),
        } as any

        // Create mock extension context
        const mockExtensionContext = createMockExtensionContext()

        projectNode = new SageMakerUnifiedStudioProjectNode(mockParent, mockAuthProvider, mockExtensionContext)

        sinon.stub(getLogger(), 'info')
        sinon.stub(getLogger(), 'warn')

        // Stub telemetry
        sinon.stub(telemetry, 'record')

        // Create mock DataZone client
        mockDataZoneClient = {
            getProjectDefaultEnvironmentCreds: sinon.stub(),
            getUserId: sinon.stub(),
            fetchAllProjectMemberships: sinon.stub(),
            getDomainId: sinon.stub().returns('test-domain-id'),
            getToolingEnvironmentId: sinon.stub(),
            getEnvironmentDetails: sinon.stub(),
            getToolingEnvironment: sinon.stub(),
        } as any

        // Stub DataZoneClient static methods
        sinon.stub(DataZoneClient, 'getInstance').returns(mockDataZoneClient as any)

        // Stub SagemakerClient constructor
        sinon.stub(SagemakerClient.prototype, 'dispose')

        // Stub child node constructors to prevent actual instantiation
        sinon.stub(SageMakerUnifiedStudioDataNode.prototype, 'constructor' as any).returns({})
        sinon.stub(SageMakerUnifiedStudioComputeNode.prototype, 'constructor' as any).returns({})

        // Stub getContext to return false for SMUS space environment
        sinon.stub(vscodeUtils, 'getContext').returns(false)
    })

    afterEach(function () {
        sinon.restore()
    })

    describe('constructor', function () {
        it('creates instance with correct properties', function () {
            assert.strictEqual(projectNode.id, 'smusProjectNode')
            assert.strictEqual(projectNode.resource, projectNode)
        })
    })

    describe('getTreeItem', function () {
        it('returns correct tree item when no project is selected', async function () {
            const treeItem = await projectNode.getTreeItem()

            assert.strictEqual(treeItem.label, 'Select a project')
            assert.strictEqual(treeItem.collapsibleState, vscode.TreeItemCollapsibleState.Expanded)
            assert.strictEqual(treeItem.contextValue, 'smusProjectSelectPicker')
            assert.ok(treeItem.command)
            assert.strictEqual(treeItem.command?.command, 'aws.smus.projectView')
        })

        it('returns correct tree item when project is selected', async function () {
            await projectNode.setProject(mockProject)
            const treeItem = await projectNode.getTreeItem()

            assert.strictEqual(treeItem.label, 'Project: ' + mockProject.name)
            assert.strictEqual(treeItem.collapsibleState, vscode.TreeItemCollapsibleState.Expanded)
            assert.strictEqual(treeItem.contextValue, 'smusSelectedProject')
            assert.strictEqual(treeItem.tooltip, `Project: ${mockProject.name}\nID: ${mockProject.id}`)
        })
    })

    describe('getParent', function () {
        it('returns parent node', function () {
            const parent = projectNode.getParent()
            assert.ok(parent)
        })
    })

    describe('setProject', function () {
        it('updates the project and calls cleanupProjectResources', async function () {
            const cleanupSpy = sinon.spy(projectNode as any, 'cleanupProjectResources')
            await projectNode.setProject(mockProject)
            assert.strictEqual(projectNode['project'], mockProject)
            assert(cleanupSpy.calledOnce)
        })
    })

    describe('clearProject', function () {
        it('clears the project, calls cleanupProjectResources and fires change event', async function () {
            await projectNode.setProject(mockProject)
            const cleanupSpy = sinon.spy(projectNode as any, 'cleanupProjectResources')
            const emitterSpy = sinon.spy(projectNode['onDidChangeEmitter'], 'fire')

            await projectNode.clearProject()

            assert.strictEqual(projectNode['project'], undefined)
            assert(cleanupSpy.calledOnce)
            assert(emitterSpy.calledOnce)
        })
    })

    describe('getProject', function () {
        it('returns undefined when no project is set', function () {
            assert.strictEqual(projectNode.getProject(), undefined)
        })

        it('returns project when set', async function () {
            await projectNode.setProject(mockProject)
            assert.strictEqual(projectNode.getProject(), mockProject)
        })
    })

    describe('refreshNode', function () {
        it('fires change event', async function () {
            const emitterSpy = sinon.spy(projectNode['onDidChangeEmitter'], 'fire')
            await projectNode.refreshNode()
            assert(emitterSpy.calledOnce)
        })
    })

    describe('getChildren', function () {
        it('returns empty array when no project is selected', async function () {
            const children = await projectNode.getChildren()
            assert.deepStrictEqual(children, [])
        })

        it('returns data and compute nodes when project is selected and user has access', async function () {
            await projectNode.setProject(mockProject)
            const mockCredProvider = {
                getCredentials: sinon.stub().resolves({
                    accessKeyId: 'test-key',
                    secretAccessKey: 'test-secret',
                    sessionToken: 'test-token',
                }),
            }
            projectNode['authProvider'].getProjectCredentialProvider = sinon.stub().resolves(mockCredProvider)

            // Mock getToolingEnvironment method
            mockDataZoneClient.getToolingEnvironment.resolves({
                id: 'env-123',
                awsAccountRegion: 'us-east-1',
                projectId: undefined,
                domainId: undefined,
                createdBy: undefined,
                name: undefined,
                provider: undefined,
                $metadata: {},
            })

            const children = await projectNode.getChildren()
            assert.strictEqual(children.length, 2)
        })

        it('returns access denied message when user does not have project access', async function () {
            await projectNode.setProject(mockProject)

            // Mock access check to return false by throwing AccessDeniedException
            const accessError = new Error('Access denied')
            accessError.name = 'AccessDeniedException'
            projectNode['authProvider'].getProjectCredentialProvider = sinon.stub().rejects(accessError)

            const children = await projectNode.getChildren()
            assert.strictEqual(children.length, 1)
            assert.strictEqual(children[0].id, 'smusProjectAccessDenied')

            const treeItem = await children[0].getTreeItem()
            assert.strictEqual(treeItem.label, 'You do not have access to this project. Contact your administrator.')
        })

        it('throws error when initializeSagemakerClient fails', async function () {
            await projectNode.setProject(mockProject)
            const credError = new Error('Failed to initialize SageMaker client')

            // First call succeeds for access check, second call fails for initializeSagemakerClient
            const mockCredProvider = {
                getCredentials: sinon.stub().resolves({
                    accessKeyId: 'test-key',
                    secretAccessKey: 'test-secret',
                    sessionToken: 'test-token',
                }),
            }
            projectNode['authProvider'].getProjectCredentialProvider = sinon
                .stub()
                .onFirstCall()
                .resolves(mockCredProvider)
                .onSecondCall()
                .rejects(credError)

            // Mock getToolingEnvironment method
            mockDataZoneClient.getToolingEnvironment.resolves({
                id: 'env-123',
                awsAccountRegion: 'us-east-1',
                projectId: undefined,
                domainId: undefined,
                createdBy: undefined,
                name: undefined,
                provider: undefined,
                $metadata: {},
            })

            await assert.rejects(async () => await projectNode.getChildren(), credError)
        })
    })

    describe('initializeSagemakerClient', function () {
        it('throws error when no project is selected', async function () {
            await assert.rejects(
                async () => await projectNode['initializeSagemakerClient']('us-east-1'),
                /No project selected for initializing SageMaker client/
            )
        })

        it('creates SagemakerClient with project credentials', async function () {
            await projectNode.setProject(mockProject)
            const mockCredProvider = {
                getCredentials: sinon.stub().resolves({
                    accessKeyId: 'test-key',
                    secretAccessKey: 'test-secret',
                    sessionToken: 'test-token',
                }),
            }
            projectNode['authProvider'].getProjectCredentialProvider = sinon.stub().resolves(mockCredProvider)

            const client = await projectNode['initializeSagemakerClient']('us-east-1')
            assert.ok(client instanceof SagemakerClient)
            assert(
                (projectNode['authProvider'].getProjectCredentialProvider as sinon.SinonStub).calledWith(mockProject.id)
            )
        })
    })

    describe('checkProjectCredsAccess', function () {
        it('returns true when user has project access', async function () {
            const mockCredProvider = {
                getCredentials: sinon.stub().resolves({
                    accessKeyId: 'test-key',
                    secretAccessKey: 'test-secret',
                    sessionToken: 'test-token',
                }),
            }
            projectNode['authProvider'].getProjectCredentialProvider = sinon.stub().resolves(mockCredProvider)

            const hasAccess = await projectNode['checkProjectCredsAccess']('project-123')
            assert.strictEqual(hasAccess, true)
        })

        it('returns false when user does not have project access', async function () {
            const accessError = new Error('Access denied')
            accessError.name = 'AccessDeniedException'
            projectNode['authProvider'].getProjectCredentialProvider = sinon.stub().rejects(accessError)

            const hasAccess = await projectNode['checkProjectCredsAccess']('project-123')
            assert.strictEqual(hasAccess, false)
        })

        it('returns false when getCredentials fails', async function () {
            const mockCredProvider = {
                getCredentials: sinon.stub().rejects(new Error('Credentials error')),
            }
            projectNode['authProvider'].getProjectCredentialProvider = sinon.stub().resolves(mockCredProvider)

            const hasAccess = await projectNode['checkProjectCredsAccess']('project-123')
            assert.strictEqual(hasAccess, false)
        })

        it('returns false when access check throws non-AccessDeniedException error', async function () {
            projectNode['authProvider'].getProjectCredentialProvider = sinon.stub().rejects(new Error('Other error'))

            const hasAccess = await projectNode['checkProjectCredsAccess']('project-123')
            assert.strictEqual(hasAccess, false)
        })
    })

    describe('cleanupProjectResources', function () {
        it('invalidates credentials and disposes existing sagemaker client', async function () {
            // Set up existing sagemaker client with mock
            const mockClient = { dispose: sinon.stub() } as any
            projectNode['sagemakerClient'] = mockClient

            await projectNode['cleanupProjectResources']()

            assert((projectNode['authProvider'].invalidateAllProjectCredentialsInCache as sinon.SinonStub).calledOnce)
            assert(mockClient.dispose.calledOnce)
            assert.strictEqual(projectNode['sagemakerClient'], undefined)
        })

        it('handles case when no sagemaker client exists', async function () {
            projectNode['sagemakerClient'] = undefined

            await projectNode['cleanupProjectResources']()

            assert((projectNode['authProvider'].invalidateAllProjectCredentialsInCache as sinon.SinonStub).calledOnce)
        })
    })
})
