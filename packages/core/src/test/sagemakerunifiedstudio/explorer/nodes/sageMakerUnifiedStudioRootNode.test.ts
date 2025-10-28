/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import sinon from 'sinon'
import * as vscode from 'vscode'
import {
    SageMakerUnifiedStudioRootNode,
    selectSMUSProject,
} from '../../../../sagemakerunifiedstudio/explorer/nodes/sageMakerUnifiedStudioRootNode'
import { SageMakerUnifiedStudioProjectNode } from '../../../../sagemakerunifiedstudio/explorer/nodes/sageMakerUnifiedStudioProjectNode'
import { DataZoneClient, DataZoneProject } from '../../../../sagemakerunifiedstudio/shared/client/datazoneClient'
import { SageMakerUnifiedStudioAuthInfoNode } from '../../../../sagemakerunifiedstudio/explorer/nodes/sageMakerUnifiedStudioAuthInfoNode'
import { SmusAuthenticationProvider } from '../../../../sagemakerunifiedstudio/auth/providers/smusAuthenticationProvider'
import * as pickerPrompter from '../../../../shared/ui/pickerPrompter'
import { getTestWindow } from '../../../shared/vscode/window'
import { assertTelemetry } from '../../../../../src/test/testUtil'
import { createMockExtensionContext, createMockUnauthenticatedAuthProvider } from '../../testUtils'

describe('SmusRootNode', function () {
    let rootNode: SageMakerUnifiedStudioRootNode
    let mockDataZoneClient: sinon.SinonStubbedInstance<DataZoneClient>

    const testDomainId = 'test-domain-123'
    const mockProject: DataZoneProject = {
        id: 'project-123',
        name: 'Test Project',
        description: 'Test Description',
        domainId: testDomainId,
    }

    /**
     * Helper function to verify login and learn more nodes
     */
    async function verifyLoginAndLearnMoreNodes(children: any[]) {
        assert.strictEqual(children.length, 2)
        assert.strictEqual(children[0].id, 'smusLogin')
        assert.strictEqual(children[1].id, 'smusLearnMore')

        // Check login node
        const loginTreeItem = await children[0].getTreeItem()
        assert.strictEqual(loginTreeItem.label, 'Sign in to get started')
        assert.strictEqual(loginTreeItem.contextValue, 'sageMakerUnifiedStudioLogin')
        assert.deepStrictEqual(loginTreeItem.command, {
            command: 'aws.smus.login',
            title: 'Sign in to SageMaker Unified Studio',
        })

        // Check learn more node
        const learnMoreTreeItem = await children[1].getTreeItem()
        assert.strictEqual(learnMoreTreeItem.label, 'Learn more about SageMaker Unified Studio')
        assert.strictEqual(learnMoreTreeItem.contextValue, 'sageMakerUnifiedStudioLearnMore')
        assert.deepStrictEqual(learnMoreTreeItem.command, {
            command: 'aws.smus.learnMore',
            title: 'Learn more about SageMaker Unified Studio',
        })
    }

    beforeEach(function () {
        // Create mock extension context
        const mockExtensionContext = createMockExtensionContext()

        // Create a mock auth provider
        const mockAuthProvider = {
            isConnected: sinon.stub().returns(true),
            isConnectionValid: sinon.stub().returns(true),
            activeConnection: { domainId: testDomainId, ssoRegion: 'us-west-2' },
            onDidChange: sinon.stub().returns({ dispose: sinon.stub() }),
        } as any

        rootNode = new SageMakerUnifiedStudioRootNode(mockAuthProvider, mockExtensionContext)

        // Mock domain ID is handled by the mock auth provider

        // Create mock DataZone client
        mockDataZoneClient = {
            getDomainId: sinon.stub().returns(testDomainId),
            listProjects: sinon.stub(),
        } as any

        // Stub DataZoneClient static methods
        sinon.stub(DataZoneClient, 'createWithCredentials').returns(mockDataZoneClient as any)
    })

    afterEach(function () {
        sinon.restore()
    })

    describe('constructor', function () {
        it('should initialize id and resource properties', function () {
            // Create a mock auth provider
            const mockAuthProvider = {
                isConnected: sinon.stub().returns(true),
                isConnectionValid: sinon.stub().returns(true),
                activeConnection: { domainId: testDomainId, ssoRegion: 'us-west-2' },
                onDidChange: sinon.stub().returns({ dispose: sinon.stub() }),
            } as any

            const mockExtensionContext = createMockExtensionContext()

            const node = new SageMakerUnifiedStudioRootNode(mockAuthProvider, mockExtensionContext)
            assert.strictEqual(node.id, 'smusRootNode')
            assert.strictEqual(node.resource, node)
            assert.ok(node.getAuthInfoNode() instanceof SageMakerUnifiedStudioAuthInfoNode)
            assert.ok(node.getProjectSelectNode() instanceof SageMakerUnifiedStudioProjectNode)
            assert.strictEqual(typeof node.onDidChangeTreeItem, 'function')
            assert.strictEqual(typeof node.onDidChangeChildren, 'function')
        })
    })

    describe('getTreeItem', function () {
        it('returns correct tree item when authenticated', async function () {
            const treeItem = rootNode.getTreeItem()

            assert.strictEqual(treeItem.label, 'SageMaker Unified Studio')
            assert.strictEqual(treeItem.collapsibleState, vscode.TreeItemCollapsibleState.Expanded)
            assert.strictEqual(treeItem.contextValue, 'sageMakerUnifiedStudioRoot')
            assert.strictEqual(treeItem.description, 'Connected')
            assert.ok(treeItem.iconPath)
        })

        it('returns correct tree item when not authenticated', async function () {
            // Create a mock auth provider for unauthenticated state
            const mockAuthProvider = createMockUnauthenticatedAuthProvider()
            const mockExtensionContext = createMockExtensionContext()

            const unauthenticatedNode = new SageMakerUnifiedStudioRootNode(mockAuthProvider, mockExtensionContext)
            const treeItem = unauthenticatedNode.getTreeItem()

            assert.strictEqual(treeItem.label, 'SageMaker Unified Studio')
            assert.strictEqual(treeItem.collapsibleState, vscode.TreeItemCollapsibleState.Expanded)
            assert.strictEqual(treeItem.contextValue, 'sageMakerUnifiedStudioRoot')
            assert.strictEqual(treeItem.description, 'Not authenticated')
            assert.ok(treeItem.iconPath)
        })
    })

    describe('getChildren', function () {
        it('returns login node when not authenticated (empty domain ID)', async function () {
            // Create a mock auth provider for unauthenticated state
            const mockAuthProvider = createMockUnauthenticatedAuthProvider()
            const mockExtensionContext = createMockExtensionContext()

            const unauthenticatedNode = new SageMakerUnifiedStudioRootNode(mockAuthProvider, mockExtensionContext)
            const children = await unauthenticatedNode.getChildren()
            await verifyLoginAndLearnMoreNodes(children)
        })

        it('returns login node when DataZone client throws error', async function () {
            // Create a mock auth provider that throws an error
            const mockAuthProvider = {
                isConnected: sinon.stub().throws(new Error('Auth provider error')),
                isConnectionValid: sinon.stub().returns(false),
                activeConnection: undefined,
                onDidChange: sinon.stub().returns({ dispose: sinon.stub() }),
            } as any

            const mockExtensionContext = createMockExtensionContext()

            const errorNode = new SageMakerUnifiedStudioRootNode(mockAuthProvider, mockExtensionContext)
            const children = await errorNode.getChildren()
            await verifyLoginAndLearnMoreNodes(children)
        })

        it('returns root nodes when authenticated', async function () {
            mockDataZoneClient.listProjects.resolves({ projects: [mockProject], nextToken: undefined })

            const children = await rootNode.getChildren()

            assert.strictEqual(children.length, 2)
            assert.ok(children[0] instanceof SageMakerUnifiedStudioAuthInfoNode)
            assert.ok(children[1] instanceof SageMakerUnifiedStudioProjectNode)
            // The first child is the auth info node, the second is the project node
            assert.strictEqual(children[0].id, 'smusAuthInfoNode')
            assert.strictEqual(children[1].id, 'smusProjectNode')

            assert.strictEqual(children.length, 2)
            assert.strictEqual(children[1].id, 'smusProjectNode')

            const treeItem = await children[1].getTreeItem()
            assert.strictEqual(treeItem.label, 'Select a project')
            assert.strictEqual(treeItem.contextValue, 'smusProjectSelectPicker')
            assert.deepStrictEqual(treeItem.command, {
                command: 'aws.smus.projectView',
                title: 'Select Project',
                arguments: [children[1]],
            })
        })

        it('returns auth info node when connection is expired', async function () {
            // Create a mock auth provider with expired connection
            const mockAuthProvider = {
                isConnected: sinon.stub().returns(true),
                isConnectionValid: sinon.stub().returns(false),
                activeConnection: {
                    type: 'sso',
                    domainId: testDomainId,
                    ssoRegion: 'us-west-2',
                    domainUrl: 'https://test-domain.datazone.aws.amazon.com',
                    scopes: ['datazone:domain:access'],
                },
                onDidChange: sinon.stub().returns({ dispose: sinon.stub() }),
                showReauthenticationPrompt: sinon.stub(),
            } as any

            const mockExtensionContext = createMockExtensionContext()

            const expiredNode = new SageMakerUnifiedStudioRootNode(mockAuthProvider, mockExtensionContext)
            const children = await expiredNode.getChildren()

            assert.strictEqual(children.length, 1)
            assert.ok(children[0] instanceof SageMakerUnifiedStudioAuthInfoNode)
            assert.ok(mockAuthProvider.showReauthenticationPrompt.calledOnce)
        })
    })

    describe('refresh', function () {
        it('fires change events', function () {
            const onDidChangeTreeItemSpy = sinon.spy()
            const onDidChangeChildrenSpy = sinon.spy()

            rootNode.onDidChangeTreeItem(onDidChangeTreeItemSpy)
            rootNode.onDidChangeChildren(onDidChangeChildrenSpy)

            rootNode.refresh()

            assert(onDidChangeTreeItemSpy.calledOnce)
            assert(onDidChangeChildrenSpy.calledOnce)
        })
    })
})

describe('SelectSMUSProject', function () {
    let mockDataZoneClient: sinon.SinonStubbedInstance<DataZoneClient>
    let mockProjectNode: sinon.SinonStubbedInstance<SageMakerUnifiedStudioProjectNode>
    let createQuickPickStub: sinon.SinonStub
    let executeCommandStub: sinon.SinonStub
    let getContextStub: sinon.SinonStub
    let createDZClientStub: sinon.SinonStub

    const testDomainId = 'test-domain-123'
    const mockProject: DataZoneProject = {
        id: 'project-123',
        name: 'Test Project',
        description: 'Test Description',
        domainId: testDomainId,
        updatedAt: new Date(),
    }

    const mockProject2: DataZoneProject = {
        id: 'project-456',
        name: 'Another Project',
        description: 'Another Description',
        domainId: testDomainId,
        updatedAt: new Date(Date.now() - 86400000), // 1 day ago
    }

    beforeEach(function () {
        // Create mock DataZone client
        mockDataZoneClient = {
            getDomainId: sinon.stub().returns(testDomainId),
            listProjects: sinon.stub(),
            fetchAllProjects: sinon.stub(),
        } as any

        // Create mock project node
        mockProjectNode = {
            setProject: sinon.stub(),
            getProject: sinon.stub().returns(undefined),
            project: undefined,
        } as any

        // Stub createDZClientBaseOnDomainMode to return our mock client
        createDZClientStub = sinon.stub()
        createDZClientStub.resolves(mockDataZoneClient)
        sinon.replace(
            require('../../../../sagemakerunifiedstudio/explorer/nodes/utils'),
            'createDZClientBaseOnDomainMode',
            createDZClientStub
        )

        // Stub SmusAuthenticationProvider
        sinon.stub(SmusAuthenticationProvider, 'fromContext').returns({
            isConnected: sinon.stub().returns(true),
            isConnectionValid: sinon.stub().returns(true),
            activeConnection: { domainId: testDomainId, ssoRegion: 'us-west-2' },
            getDomainAccountId: sinon.stub().resolves('123456789012'),
            getDomainId: sinon.stub().returns(testDomainId),
            getDomainRegion: sinon.stub().returns('us-west-2'),
            getDerCredentialsProvider: sinon.stub().resolves({
                getCredentials: sinon.stub().resolves({
                    accessKeyId: 'test-key',
                    secretAccessKey: 'test-secret',
                    sessionToken: 'test-token',
                }),
            }),
        } as any)

        // Stub getContext to return false for Express mode by default (non-Express mode)
        getContextStub = sinon.stub()
        getContextStub.withArgs('aws.smus.isExpressMode').returns(false)
        getContextStub.callThrough()
        sinon.replace(require('../../../../shared/vscode/setContext'), 'getContext', getContextStub)

        // Stub quickPick - return the project directly (not wrapped in an item)
        const mockQuickPick = {
            prompt: sinon.stub().resolves(mockProject),
        }
        createQuickPickStub = sinon.stub(pickerPrompter, 'createQuickPick').returns(mockQuickPick as any)

        // Stub vscode.commands.executeCommand
        executeCommandStub = sinon.stub(vscode.commands, 'executeCommand')
    })

    afterEach(function () {
        sinon.restore()
    })

    it('fetches all projects and sets the project for first time', async function () {
        mockDataZoneClient.fetchAllProjects.resolves([mockProject, mockProject2])

        const result = await selectSMUSProject(mockProjectNode as any)

        assert.strictEqual(result, mockProject)
        assert.ok(mockDataZoneClient.fetchAllProjects.calledOnce)
        assert.ok(mockDataZoneClient.fetchAllProjects.calledWith())
        assert.ok(createQuickPickStub.calledOnce)
        assert.ok(mockProjectNode.setProject.calledOnce)
        assert.ok(executeCommandStub.calledWith('aws.smus.rootView.refresh'))
        assertTelemetry('smus_accessProject', {
            result: 'Succeeded',
            smusProjectId: mockProject.id,
        })
    })

    it('filters out GenerativeAIModelGovernanceProject', async function () {
        const governanceProject: DataZoneProject = {
            id: 'governance-123',
            name: 'GenerativeAIModelGovernanceProject',
            description: 'Governance project',
            domainId: testDomainId,
            updatedAt: new Date(),
        }

        mockDataZoneClient.fetchAllProjects.resolves([mockProject, governanceProject, mockProject2])

        await selectSMUSProject(mockProjectNode as any)

        // Verify that the governance project is filtered out
        const quickPickCall = createQuickPickStub.getCall(0)
        const items = quickPickCall.args[0]
        assert.strictEqual(items.length, 2) // Should only have mockProject and mockProject2
        assert.ok(!items.some((item: any) => item.data.name === 'GenerativeAIModelGovernanceProject'))
    })

    it('handles no active connection', async function () {
        sinon.restore()
        sinon.stub(SmusAuthenticationProvider, 'fromContext').returns({
            activeConnection: undefined,
            getDomainId: sinon.stub().returns(undefined),
        } as any)

        const result = await selectSMUSProject(mockProjectNode as any)
        assert.strictEqual(result, undefined)

        assertTelemetry('smus_accessProject', {
            result: 'Succeeded',
        })
    })

    it('fetches all projects and switches the current project', async function () {
        mockProjectNode = {
            setProject: sinon.stub(),
            getProject: sinon.stub().returns(mockProject),
            project: mockProject,
        } as any
        mockDataZoneClient.fetchAllProjects.resolves([mockProject, mockProject2])

        // Stub quickPick to return mockProject2 for the second test
        const mockQuickPick = {
            prompt: sinon.stub().resolves(mockProject2),
        }
        createQuickPickStub.restore() // Remove the previous stub
        createQuickPickStub = sinon.stub(pickerPrompter, 'createQuickPick').returns(mockQuickPick as any)

        const result = await selectSMUSProject(mockProjectNode as any)

        assert.strictEqual(result, mockProject2)
        assert.ok(mockDataZoneClient.fetchAllProjects.calledOnce)
        assert.ok(mockDataZoneClient.fetchAllProjects.calledWith())
        assert.ok(createQuickPickStub.calledOnce)
        assert.ok(mockProjectNode.setProject.calledOnce)
        assert.ok(executeCommandStub.calledWith('aws.smus.rootView.refresh'))
        assertTelemetry('smus_accessProject', {
            result: 'Succeeded',
            smusProjectId: mockProject2.id,
        })
    })

    it('shows message when no projects found', async function () {
        mockDataZoneClient.fetchAllProjects.resolves([])

        const result = await selectSMUSProject(mockProjectNode as any)

        assert.strictEqual(result, undefined)
        assert.ok(!mockProjectNode.setProject.called)
    })

    it('handles API errors gracefully', async function () {
        const error = new Error('API error')
        mockDataZoneClient.fetchAllProjects.rejects(error)

        const result = await selectSMUSProject(mockProjectNode as any)
        assert.strictEqual(result, undefined)

        assert.ok(!mockProjectNode.setProject.called)
        assertTelemetry('smus_accessProject', {
            result: 'Succeeded',
        })
    })

    it('handles case when user cancels project selection', async function () {
        mockDataZoneClient.fetchAllProjects.resolves([mockProject, mockProject2])

        // Make quickPick return undefined (user cancelled)
        const mockQuickPick = {
            prompt: sinon.stub().resolves(undefined),
        }
        createQuickPickStub.returns(mockQuickPick as any)

        const result = await selectSMUSProject(mockProjectNode as any)

        // Should return undefined
        assert.strictEqual(result, undefined)

        // Verify project was not set
        assert.ok(!mockProjectNode.setProject.called)

        // Verify refresh command was not called
        assert.ok(!executeCommandStub.called)
    })

    it('handles empty projects list correctly', async function () {
        mockDataZoneClient.fetchAllProjects.resolves([])

        const result = await selectSMUSProject(mockProjectNode as any)

        assert.strictEqual(result, undefined)
        assert.ok(mockDataZoneClient.fetchAllProjects.calledOnce)
        assert.ok(!mockProjectNode.setProject.called)
        assert.ok(!executeCommandStub.called)
    })
})

describe('selectSMUSProject - Additional Tests', function () {
    let mockDataZoneClient: sinon.SinonStubbedInstance<DataZoneClient>
    let mockProjectNode: sinon.SinonStubbedInstance<SageMakerUnifiedStudioProjectNode>
    let createQuickPickStub: sinon.SinonStub
    let executeCommandStub: sinon.SinonStub
    let getContextStub: sinon.SinonStub
    let createDZClientStub: sinon.SinonStub

    const testDomainId = 'test-domain-123'
    const mockProject: DataZoneProject = {
        id: 'project-123',
        name: 'Test Project',
        description: 'Test Description',
        domainId: testDomainId,
        updatedAt: new Date(),
    }

    beforeEach(function () {
        mockDataZoneClient = {
            getDomainId: sinon.stub().returns(testDomainId),
            fetchAllProjects: sinon.stub(),
        } as any

        mockProjectNode = {
            setProject: sinon.stub(),
        } as any

        // Stub createDZClientBaseOnDomainMode to return our mock client
        createDZClientStub = sinon.stub()
        createDZClientStub.resolves(mockDataZoneClient)
        sinon.replace(
            require('../../../../sagemakerunifiedstudio/explorer/nodes/utils'),
            'createDZClientBaseOnDomainMode',
            createDZClientStub
        )
        sinon.stub(SmusAuthenticationProvider, 'fromContext').returns({
            activeConnection: { domainId: testDomainId, ssoRegion: 'us-west-2' },
            getDomainAccountId: sinon.stub().resolves('123456789012'),
            getDomainId: sinon.stub().returns(testDomainId),
            getDomainRegion: sinon.stub().returns('us-west-2'),
            getDerCredentialsProvider: sinon.stub().resolves({
                getCredentials: sinon.stub().resolves({
                    accessKeyId: 'test-key',
                    secretAccessKey: 'test-secret',
                    sessionToken: 'test-token',
                }),
            }),
        } as any)

        // Stub getContext to return false for Express mode by default (non-Express mode)
        getContextStub = sinon.stub()
        getContextStub.withArgs('aws.smus.isExpressMode').returns(false)
        getContextStub.callThrough()
        sinon.replace(require('../../../../shared/vscode/setContext'), 'getContext', getContextStub)

        const mockQuickPick = {
            prompt: sinon.stub().resolves(mockProject),
        }
        createQuickPickStub = sinon.stub(pickerPrompter, 'createQuickPick').returns(mockQuickPick as any)
        executeCommandStub = sinon.stub(vscode.commands, 'executeCommand')
    })

    afterEach(function () {
        sinon.restore()
    })

    it('handles access denied error gracefully', async function () {
        const accessDeniedError = new Error('Access denied')
        accessDeniedError.name = 'AccessDeniedError'
        mockDataZoneClient.fetchAllProjects.rejects(accessDeniedError)

        const result = await selectSMUSProject(mockProjectNode as any)

        assert.strictEqual(result, undefined)
        assert.ok(
            createQuickPickStub.calledWith([
                {
                    label: '$(error)',
                    description: "You don't have permissions to view projects. Please contact your administrator",
                },
            ])
        )
    })

    it('shows "No projects found" message when projects list is empty', async function () {
        mockDataZoneClient.fetchAllProjects.resolves([])

        const result = await selectSMUSProject(mockProjectNode as any)

        assert.strictEqual(result, undefined)
        const testWindow = getTestWindow()
        assert.ok(testWindow.shownMessages.some((msg) => msg.message === 'No projects found in the domain'))
        assert.ok(
            createQuickPickStub.calledWith([
                {
                    label: 'No projects found',
                    detail: '',
                    description: '',
                    data: {},
                },
            ])
        )
    })

    it('handles invalid selected project object', async function () {
        mockDataZoneClient.fetchAllProjects.resolves([mockProject])

        // Mock quickPick to return an object with 'type' property (invalid selection)
        const mockQuickPick = {
            prompt: sinon.stub().resolves({ type: 'invalid', data: mockProject }),
        }
        createQuickPickStub.returns(mockQuickPick as any)

        const result = await selectSMUSProject(mockProjectNode as any)

        assert.deepStrictEqual(result, { type: 'invalid', data: mockProject })
        assert.ok(!mockProjectNode.setProject.called)
        assert.ok(!executeCommandStub.called)
    })
})

describe('selectSMUSProject - Express Mode', function () {
    let mockDataZoneClient: sinon.SinonStubbedInstance<DataZoneClient>
    let mockProjectNode: sinon.SinonStubbedInstance<SageMakerUnifiedStudioProjectNode>
    let createQuickPickStub: sinon.SinonStub
    let executeCommandStub: sinon.SinonStub
    let getContextStub: sinon.SinonStub
    let createDZClientStub: sinon.SinonStub

    const testDomainId = 'test-domain-123'
    const testUserProfileId = 'user-profile-123'

    const userProject: DataZoneProject = {
        id: 'project-123',
        name: 'User Project',
        description: 'Project created by user',
        domainId: testDomainId,
        createdBy: testUserProfileId,
        updatedAt: new Date(),
    }

    const otherUserProject: DataZoneProject = {
        id: 'project-456',
        name: 'Other User Project',
        description: 'Project created by another user',
        domainId: testDomainId,
        createdBy: 'other-user-profile-456',
        updatedAt: new Date(Date.now() - 86400000),
    }

    beforeEach(function () {
        mockDataZoneClient = {
            getDomainId: sinon.stub().returns(testDomainId),
            fetchAllProjects: sinon.stub(),
            getUserProfileId: sinon.stub().resolves(testUserProfileId),
        } as any

        mockProjectNode = {
            setProject: sinon.stub(),
        } as any

        // Stub createDZClientBaseOnDomainMode to return our mock client
        createDZClientStub = sinon.stub()
        createDZClientStub.resolves(mockDataZoneClient)
        sinon.replace(
            require('../../../../sagemakerunifiedstudio/explorer/nodes/utils'),
            'createDZClientBaseOnDomainMode',
            createDZClientStub
        )

        sinon.stub(SmusAuthenticationProvider, 'fromContext').returns({
            activeConnection: { domainId: testDomainId, ssoRegion: 'us-west-2' },
            getDomainAccountId: sinon.stub().resolves('123456789012'),
            getDomainId: sinon.stub().returns(testDomainId),
            getDomainRegion: sinon.stub().returns('us-west-2'),
            getDerCredentialsProvider: sinon.stub().resolves({
                getCredentials: sinon.stub().resolves({
                    accessKeyId: 'test-key',
                    secretAccessKey: 'test-secret',
                    sessionToken: 'test-token',
                }),
            }),
        } as any)

        const mockQuickPick = {
            prompt: sinon.stub().resolves(userProject),
        }
        createQuickPickStub = sinon.stub(pickerPrompter, 'createQuickPick').returns(mockQuickPick as any)
        executeCommandStub = sinon.stub(vscode.commands, 'executeCommand')

        // Stub getContext to simulate Express mode
        getContextStub = sinon.stub()
        getContextStub.withArgs('aws.smus.isExpressMode').returns(true)
        getContextStub.callThrough()
        sinon.replace(require('../../../../shared/vscode/setContext'), 'getContext', getContextStub)
    })

    afterEach(function () {
        sinon.restore()
    })

    it('filters projects to show only user-created projects in Express mode', async function () {
        mockDataZoneClient.fetchAllProjects.resolves([userProject, otherUserProject])

        const result = await selectSMUSProject(mockProjectNode as any)

        // Verify getUserProfileId was called
        assert.ok(mockDataZoneClient.getUserProfileId.calledOnce)

        // Verify only user-created projects are shown in quick pick
        const quickPickCall = createQuickPickStub.getCall(0)
        const items = quickPickCall.args[0]
        assert.strictEqual(items.length, 1)
        assert.strictEqual(items[0].data.id, userProject.id)
        assert.strictEqual(items[0].data.createdBy, testUserProfileId)

        // Verify the user project was selected and set
        assert.strictEqual(result, userProject)
        assert.ok(mockProjectNode.setProject.calledOnce)
        assert.ok(executeCommandStub.calledWith('aws.smus.rootView.refresh'))
    })

    it('shows message when no user-created projects found in Express mode', async function () {
        mockDataZoneClient.fetchAllProjects.resolves([otherUserProject])

        const result = await selectSMUSProject(mockProjectNode as any)

        // Verify getUserProfileId was called
        assert.ok(mockDataZoneClient.getUserProfileId.calledOnce)

        // Verify no projects were shown in quick pick
        assert.ok(!createQuickPickStub.called)

        // Verify appropriate message was shown
        const testWindow = getTestWindow()
        assert.ok(testWindow.shownMessages.some((msg) => msg.message === 'No accessible projects found'))

        // Verify no project was set
        assert.strictEqual(result, undefined)
        assert.ok(!mockProjectNode.setProject.called)
    })

    it('shows all user-created projects when multiple exist in Express mode', async function () {
        const userProject2: DataZoneProject = {
            id: 'project-789',
            name: 'Another User Project',
            description: 'Another project created by user',
            domainId: testDomainId,
            createdBy: testUserProfileId,
            updatedAt: new Date(Date.now() - 172800000), // 2 days ago
        }

        mockDataZoneClient.fetchAllProjects.resolves([userProject, otherUserProject, userProject2])

        await selectSMUSProject(mockProjectNode as any)

        // Verify only user-created projects are shown
        const quickPickCall = createQuickPickStub.getCall(0)
        const items = quickPickCall.args[0]
        assert.strictEqual(items.length, 2)
        assert.ok(items.every((item: any) => item.data.createdBy === testUserProfileId))
        assert.ok(items.some((item: any) => item.data.id === userProject.id))
        assert.ok(items.some((item: any) => item.data.id === userProject2.id))
        assert.ok(!items.some((item: any) => item.data.id === otherUserProject.id))
    })

    it('does not filter projects in non-Express mode', async function () {
        // Stub getContext to return false for Express mode
        getContextStub.withArgs('aws.smus.isExpressMode').returns(false)

        mockDataZoneClient.fetchAllProjects.resolves([userProject, otherUserProject])

        await selectSMUSProject(mockProjectNode as any)

        // Verify getUserProfileId was NOT called
        assert.ok(!mockDataZoneClient.getUserProfileId.called)

        // Verify all projects are shown in quick pick
        const quickPickCall = createQuickPickStub.getCall(0)
        const items = quickPickCall.args[0]
        assert.strictEqual(items.length, 2)
        assert.ok(items.some((item: any) => item.data.id === userProject.id))
        assert.ok(items.some((item: any) => item.data.id === otherUserProject.id))
    })
})
