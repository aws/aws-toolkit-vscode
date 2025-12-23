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
import { DataZoneCustomClientHelper } from '../../../../sagemakerunifiedstudio/shared/client/datazoneCustomClientHelper'
import { DefaultStsClient } from '../../../../shared/clients/stsClient'
import { SmusUtils, SmusErrorCodes } from '../../../../sagemakerunifiedstudio/shared/smusUtils'
import { ToolkitError } from '../../../../shared/errors'
import * as utils from '../../../../sagemakerunifiedstudio/explorer/nodes/utils'
import * as setContextModule from '../../../../shared/vscode/setContext'

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
        sinon.replace(utils, 'createDZClientBaseOnDomainMode', createDZClientStub)

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

        // Stub getContext to return false for IAM mode by default (non-IAM mode)
        getContextStub = sinon.stub()
        getContextStub.withArgs('aws.smus.isIamMode').returns(false)
        getContextStub.callThrough()
        sinon.replace(setContextModule, 'getContext', getContextStub)

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
        sinon.replace(utils, 'createDZClientBaseOnDomainMode', createDZClientStub)
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

        // Stub getContext to return false for IAM mode by default (non-IAM mode)
        getContextStub = sinon.stub()
        getContextStub.withArgs('aws.smus.isIamMode').returns(false)
        getContextStub.callThrough()
        sinon.replace(setContextModule, 'getContext', getContextStub)

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
        // When no projects are found, createQuickPick should not be called
        assert.ok(!createQuickPickStub.called)
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
    let getInstanceStub: sinon.SinonStub
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
        const mockGroupProfileId = 'group-profile-123'

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
        sinon.replace(utils, 'createDZClientBaseOnDomainMode', createDZClientStub)

        // Mock credentials provider
        const mockCredentialsProvider = {
            getCredentials: sinon.stub().resolves({
                accessKeyId: 'test-key',
                secretAccessKey: 'test-secret',
                sessionToken: 'test-token',
            }),
        }

        const mockAuthProvider = {
            activeConnection: {
                type: 'iam' as const,
                profileName: 'test-profile',
                region: 'us-west-2',
                domainId: testDomainId,
                domainUrl: `https://${testDomainId}.sagemaker.us-west-2.on.aws/`,
            },
            getDomainAccountId: sinon.stub().resolves('123456789012'),
            getDomainId: sinon.stub().returns(testDomainId),
            getDomainRegion: sinon.stub().returns('us-west-2'),
            getCredentialsProviderForIamProfile: sinon.stub().resolves(mockCredentialsProvider),
            getIamPrincipalArn: sinon.stub().resolves('arn:aws:sts::123456789012:assumed-role/TestRole/test-session'),
        }
        sinon.stub(SmusAuthenticationProvider, 'fromContext').returns(mockAuthProvider as any)

        // Mock DataZoneCustomClientHelper
        const mockDataZoneCustomClientHelper = {
            getGroupProfileId: sinon.stub().resolves(mockGroupProfileId),
        }
        getInstanceStub = sinon
            .stub(DataZoneCustomClientHelper, 'getInstance')
            .returns(mockDataZoneCustomClientHelper as any)

        // Mock STS client
        sinon.stub(DefaultStsClient.prototype, 'getCallerIdentity').resolves({
            Arn: 'arn:aws:sts::123456789012:assumed-role/TestRole/test-session',
            UserId: 'AIDAI123456789EXAMPLE:test-session',
            Account: '123456789012',
        })

        // Mock SmusUtils - simulate IAM role session (not IAM user)
        sinon.stub(SmusUtils, 'isIamUserArn').returns(false)
        sinon.stub(SmusUtils, 'convertAssumedRoleArnToIamRoleArn').returns('arn:aws:iam::123456789012:role/TestRole')

        const mockQuickPick = {
            prompt: sinon.stub().resolves(userProject),
        }
        createQuickPickStub = sinon.stub(pickerPrompter, 'createQuickPick').returns(mockQuickPick as any)
        executeCommandStub = sinon.stub(vscode.commands, 'executeCommand')

        // Stub getContext to simulate IAM mode
        getContextStub = sinon.stub()
        getContextStub.withArgs('aws.smus.isIamMode').returns(true)
        getContextStub.callThrough()
        sinon.replace(setContextModule, 'getContext', getContextStub)
    })

    afterEach(function () {
        sinon.restore()
    })

    it('filters projects to show only user-created projects in IAM mode', async function () {
        mockDataZoneClient.fetchAllProjects.resolves([userProject, otherUserProject])

        const result = await selectSMUSProject(mockProjectNode as any)

        // Verify DataZoneCustomClientHelper.getInstance was called
        assert.ok(getInstanceStub.called)

        // Verify projects were fetched with group identifier
        assert.ok(mockDataZoneClient.fetchAllProjects.calledOnce)
        const fetchCallArgs = mockDataZoneClient.fetchAllProjects.getCall(0).args[0]
        assert.ok(fetchCallArgs?.groupIdentifier)

        // Verify the project was selected and set
        assert.strictEqual(result, userProject)
        assert.ok(mockProjectNode.setProject.calledOnce)
        assert.ok(executeCommandStub.calledWith('aws.smus.rootView.refresh'))
    })

    it('shows message when no user-created projects found in IAM mode', async function () {
        mockDataZoneClient.fetchAllProjects.resolves([])

        const result = await selectSMUSProject(mockProjectNode as any)

        // Verify DataZoneCustomClientHelper.getInstance was called
        assert.ok(getInstanceStub.called)

        // Verify no projects were shown in quick pick
        assert.ok(!createQuickPickStub.called)

        // Verify appropriate message was shown
        const testWindow = getTestWindow()
        assert.ok(
            testWindow.shownMessages.some(
                (msg) => msg.message === 'No accessible projects found for your IAM principal'
            )
        )

        // Verify no project was set
        assert.strictEqual(result, undefined)
        assert.ok(!mockProjectNode.setProject.called)
    })

    it('shows all user-created projects when multiple exist in IAM mode', async function () {
        const userProject2: DataZoneProject = {
            id: 'project-789',
            name: 'Another User Project',
            description: 'Another project created by user',
            domainId: testDomainId,
            createdBy: testUserProfileId,
            updatedAt: new Date(Date.now() - 172800000), // 2 days ago
        }

        // In IAM mode, fetchAllProjects is called with groupIdentifier filter
        // So the API returns only projects for that group (already filtered)
        mockDataZoneClient.fetchAllProjects.resolves([userProject, userProject2])

        await selectSMUSProject(mockProjectNode as any)

        // Verify projects were fetched with group identifier
        assert.ok(mockDataZoneClient.fetchAllProjects.calledOnce)
        const fetchCallArgs = mockDataZoneClient.fetchAllProjects.getCall(0).args[0]
        assert.ok(fetchCallArgs?.groupIdentifier)

        // Verify all returned projects are shown in quick pick
        const quickPickCall = createQuickPickStub.getCall(0)
        const items = quickPickCall.args[0]
        assert.strictEqual(items.length, 2)
        assert.ok(items.some((item: any) => item.data.id === userProject.id))
        assert.ok(items.some((item: any) => item.data.id === userProject2.id))
    })

    it('does not filter projects in non-IAM mode', async function () {
        // Stub getContext to return false for IAM mode
        getContextStub.withArgs('aws.smus.isIamMode').returns(false)

        mockDataZoneClient.fetchAllProjects.resolves([userProject, otherUserProject])

        await selectSMUSProject(mockProjectNode as any)

        // Verify DataZoneCustomClientHelper.getInstance was NOT called in non-IAM mode
        assert.ok(!getInstanceStub.called)

        // Verify all projects are shown in quick pick
        const quickPickCall = createQuickPickStub.getCall(0)
        const items = quickPickCall.args[0]
        assert.strictEqual(items.length, 2)
        assert.ok(items.some((item: any) => item.data.id === userProject.id))
        assert.ok(items.some((item: any) => item.data.id === otherUserProject.id))
    })
})

describe('selectSMUSProject - Error Handling', function () {
    let mockDataZoneClient: sinon.SinonStubbedInstance<DataZoneClient>
    let mockProjectNode: sinon.SinonStubbedInstance<SageMakerUnifiedStudioProjectNode>
    let createQuickPickStub: sinon.SinonStub
    let getContextStub: sinon.SinonStub
    let createDZClientStub: sinon.SinonStub

    const testDomainId = 'test-domain-123'
    const testUserProfileId = 'user-profile-123'

    const mockProject: DataZoneProject = {
        id: 'project-123',
        name: 'Test Project',
        description: 'Test Description',
        domainId: testDomainId,
        createdBy: testUserProfileId,
        updatedAt: new Date(),
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

        createDZClientStub = sinon.stub()
        createDZClientStub.resolves(mockDataZoneClient)
        sinon.replace(utils, 'createDZClientBaseOnDomainMode', createDZClientStub)

        sinon.stub(SmusAuthenticationProvider, 'fromContext').returns({
            activeConnection: { domainId: testDomainId, ssoRegion: 'us-west-2' },
            getDomainAccountId: sinon.stub().resolves('123456789012'),
            getDomainId: sinon.stub().returns(testDomainId),
            getDomainRegion: sinon.stub().returns('us-west-2'),
        } as any)

        getContextStub = sinon.stub()
        getContextStub.withArgs('aws.smus.isIamMode').returns(false)
        getContextStub.callThrough()
        sinon.replace(setContextModule, 'getContext', getContextStub)

        const mockQuickPick = {
            prompt: sinon.stub().resolves(mockProject),
        }
        createQuickPickStub = sinon.stub(pickerPrompter, 'createQuickPick').returns(mockQuickPick as any)
    })

    afterEach(function () {
        sinon.restore()
    })

    describe('No projects scenario', function () {
        it('displays "No projects found in the domain" message when user has no projects', async function () {
            mockDataZoneClient.fetchAllProjects.resolves([])

            const result = await selectSMUSProject(mockProjectNode as any)

            assert.strictEqual(result, undefined)
            const testWindow = getTestWindow()
            assert.ok(testWindow.shownMessages.some((msg) => msg.message === 'No projects found in the domain'))
            // createQuickPick should NOT be called when there are no projects
            assert.ok(!createQuickPickStub.called)
            assert.ok(!mockProjectNode.setProject.called)
        })
    })

    describe('No accessible projects in IAM mode', function () {
        beforeEach(function () {
            getContextStub.withArgs('aws.smus.isIamMode').returns(true)

            // Override the SSO connection with IAM connection for IAM mode tests
            sinon.restore()

            // Re-setup mocks with IAM connection
            mockDataZoneClient = {
                getDomainId: sinon.stub().returns(testDomainId),
                fetchAllProjects: sinon.stub(),
                getUserProfileId: sinon.stub().resolves(testUserProfileId),
            } as any

            mockProjectNode = {
                setProject: sinon.stub(),
            } as any

            createDZClientStub = sinon.stub()
            createDZClientStub.resolves(mockDataZoneClient)
            sinon.replace(utils, 'createDZClientBaseOnDomainMode', createDZClientStub)

            // Mock credentials provider
            const mockCredentialsProvider = {
                getCredentials: sinon.stub().resolves({
                    accessKeyId: 'test-key',
                    secretAccessKey: 'test-secret',
                    sessionToken: 'test-token',
                }),
            }

            const mockAuthProvider = {
                activeConnection: {
                    type: 'iam' as const,
                    profileName: 'test-profile',
                    region: 'us-west-2',
                    domainId: testDomainId,
                    domainUrl: `https://${testDomainId}.sagemaker.us-west-2.on.aws/`,
                },
                getDomainAccountId: sinon.stub().resolves('123456789012'),
                getDomainId: sinon.stub().returns(testDomainId),
                getDomainRegion: sinon.stub().returns('us-west-2'),
                getCredentialsProviderForIamProfile: sinon.stub().resolves(mockCredentialsProvider),
                getIamPrincipalArn: sinon
                    .stub()
                    .resolves('arn:aws:sts::123456789012:assumed-role/TestRole/test-session'),
            }
            sinon.stub(SmusAuthenticationProvider, 'fromContext').returns(mockAuthProvider as any)

            // Mock DataZoneCustomClientHelper
            const mockDataZoneCustomClientHelper = {
                getGroupProfileId: sinon.stub().resolves('group-profile-123'),
            }
            sinon.stub(DataZoneCustomClientHelper, 'getInstance').returns(mockDataZoneCustomClientHelper as any)

            // Mock STS client
            sinon.stub(DefaultStsClient.prototype, 'getCallerIdentity').resolves({
                Arn: 'arn:aws:sts::123456789012:assumed-role/TestRole/test-session',
                UserId: 'AIDAI123456789EXAMPLE:test-session',
                Account: '123456789012',
            })

            // Mock SmusUtils - simulate IAM role session (not IAM user)
            sinon.stub(SmusUtils, 'isIamUserArn').returns(false)
            sinon
                .stub(SmusUtils, 'convertAssumedRoleArnToIamRoleArn')
                .returns('arn:aws:iam::123456789012:role/TestRole')

            const mockQuickPick = {
                prompt: sinon.stub().resolves(mockProject),
            }
            createQuickPickStub = sinon.stub(pickerPrompter, 'createQuickPick').returns(mockQuickPick as any)

            getContextStub = sinon.stub()
            getContextStub.withArgs('aws.smus.isIamMode').returns(true)
            getContextStub.callThrough()
            sinon.replace(setContextModule, 'getContext', getContextStub)
        })

        it('displays "No accessible projects found" when user has no projects they created', async function () {
            // In IAM mode, fetchAllProjects is called with groupIdentifier filter
            // which should return empty array when no projects match
            mockDataZoneClient.fetchAllProjects.resolves([])

            const result = await selectSMUSProject(mockProjectNode as any)

            assert.strictEqual(result, undefined)
            const testWindow = getTestWindow()
            assert.ok(
                testWindow.shownMessages.some(
                    (msg) => msg.message === 'No accessible projects found for your IAM principal'
                )
            )
            assert.ok(!mockProjectNode.setProject.called)
        })

        it('handles getGroupProfileId failure with appropriate error message', async function () {
            const testRoleArn = 'arn:aws:iam::123456789012:role/TestRole'

            // Mock getGroupProfileId to throw a ToolkitError with NoGroupProfileFound code
            const groupProfileError = new ToolkitError(`No group profile found for IAM role: ${testRoleArn}`, {
                code: SmusErrorCodes.NoGroupProfileFound,
                name: 'ToolkitError',
            })
            const mockDataZoneCustomClientHelper = {
                getGroupProfileId: sinon.stub().rejects(groupProfileError),
            }
            sinon.restore()
            sinon.stub(DataZoneCustomClientHelper, 'getInstance').returns(mockDataZoneCustomClientHelper as any)

            // Re-stub other dependencies
            const mockAuthProvider = {
                activeConnection: {
                    type: 'iam' as const,
                    profileName: 'test-profile',
                    region: 'us-west-2',
                    domainId: testDomainId,
                    domainUrl: `https://${testDomainId}.sagemaker.us-west-2.on.aws/`,
                },
                getDomainAccountId: sinon.stub().resolves('123456789012'),
                getDomainId: sinon.stub().returns(testDomainId),
                getDomainRegion: sinon.stub().returns('us-west-2'),
                getCredentialsProviderForIamProfile: sinon.stub().resolves({
                    getCredentials: sinon.stub().resolves({
                        accessKeyId: 'test-key',
                        secretAccessKey: 'test-secret',
                        sessionToken: 'test-token',
                    }),
                }),
                getIamPrincipalArn: sinon.stub().resolves(testRoleArn),
            }
            sinon.stub(SmusAuthenticationProvider, 'fromContext').returns(mockAuthProvider as any)

            sinon.stub(DefaultStsClient.prototype, 'getCallerIdentity').resolves({
                Arn: 'arn:aws:sts::123456789012:assumed-role/TestRole/test-session',
                UserId: 'AIDAI123456789EXAMPLE:test-session',
                Account: '123456789012',
            })

            const getContextStub = sinon.stub()
            getContextStub.withArgs('aws.smus.isIamMode').returns(true)
            getContextStub.callThrough()
            sinon.replace(setContextModule, 'getContext', getContextStub)

            sinon.replace(utils, 'createDZClientBaseOnDomainMode', sinon.stub().resolves(mockDataZoneClient))

            const result = await selectSMUSProject(mockProjectNode as any)

            assert.ok(result instanceof Error)
            const testWindow = getTestWindow()
            assert.ok(
                testWindow.shownMessages.some((msg) =>
                    msg.message.includes(`No resources found for IAM principal: ${testRoleArn}`)
                )
            )
        })

        it('handles getUserProfileIdForIamPrincipal failure with appropriate error message', async function () {
            const testUserArn = 'arn:aws:iam::123456789012:user/test-user'

            // Mock getUserProfileIdForIamPrincipal to throw a ToolkitError with NoUserProfileFound code
            const userProfileError = new ToolkitError(`No user profile found for IAM principal: ${testUserArn}`, {
                code: SmusErrorCodes.NoUserProfileFound,
                name: 'ToolkitError',
            })

            sinon.restore()

            // Re-stub dependencies for IAM user flow
            const mockAuthProvider = {
                activeConnection: {
                    type: 'iam' as const,
                    profileName: 'test-profile',
                    region: 'us-west-2',
                    domainId: testDomainId,
                    domainUrl: `https://${testDomainId}.sagemaker.us-west-2.on.aws/`,
                },
                getDomainAccountId: sinon.stub().resolves('123456789012'),
                getDomainId: sinon.stub().returns(testDomainId),
                getDomainRegion: sinon.stub().returns('us-west-2'),
                getCredentialsProviderForIamProfile: sinon.stub().resolves({
                    getCredentials: sinon.stub().resolves({
                        accessKeyId: 'test-key',
                        secretAccessKey: 'test-secret',
                        sessionToken: 'test-token',
                    }),
                }),
                getIamPrincipalArn: sinon.stub().resolves(testUserArn),
            }
            sinon.stub(SmusAuthenticationProvider, 'fromContext').returns(mockAuthProvider as any)

            // Mock SmusUtils to indicate this is an IAM user
            sinon.stub(SmusUtils, 'isIamUserArn').returns(true)

            const getContextStub = sinon.stub()
            getContextStub.withArgs('aws.smus.isIamMode').returns(true)
            getContextStub.callThrough()
            sinon.replace(setContextModule, 'getContext', getContextStub)

            // Create a new mock client with the failing method
            const failingMockDataZoneClient = {
                getDomainId: sinon.stub().returns(testDomainId),
                fetchAllProjects: sinon.stub(),
                getUserProfileIdForIamPrincipal: sinon.stub().rejects(userProfileError),
            } as any

            sinon.replace(utils, 'createDZClientBaseOnDomainMode', sinon.stub().resolves(failingMockDataZoneClient))

            const result = await selectSMUSProject(mockProjectNode as any)

            assert.ok(result instanceof Error)
            const testWindow = getTestWindow()
            assert.ok(
                testWindow.shownMessages.some((msg) =>
                    msg.message.includes(`No resources found for IAM principal: ${testUserArn}`)
                )
            )
        })
    })

    describe('Access denied scenarios', function () {
        it('displays appropriate error message when user lacks permissions to view projects', async function () {
            const accessDeniedError = new Error('Access denied to list projects')
            accessDeniedError.name = 'AccessDeniedException'
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
            assert.ok(!mockProjectNode.setProject.called)
        })

        it('handles AccessDenied error name variations', async function () {
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

        it('handles UnauthorizedOperation error as access denied', async function () {
            const unauthorizedError = new Error('Unauthorized operation')
            unauthorizedError.name = 'UnauthorizedOperationAccessDenied'
            mockDataZoneClient.fetchAllProjects.rejects(unauthorizedError)

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
    })
})

describe('smusSignOutCommand', function () {
    let mockAuthProvider: sinon.SinonStubbedInstance<SmusAuthenticationProvider>
    let executeCommandStub: sinon.SinonStub
    let fromContextStub: sinon.SinonStub

    beforeEach(function () {
        const testDomainId = 'test-domain-123'

        mockAuthProvider = {
            dispose: sinon.stub(),
            isConnected: sinon.stub().returns(true),
            isConnectionValid: sinon.stub().returns(true),
            signOut: sinon.stub().resolves(),
            getDomainId: sinon.stub().returns(testDomainId),
            getDomainRegion: sinon.stub().returns('us-west-2'),
            activeConnection: {
                type: 'sso',
                domainId: testDomainId,
                ssoRegion: 'us-west-2',
                domainUrl: 'https://test-domain.datazone.aws.amazon.com',
                scopes: ['datazone:domain:access'],
            },
            onDidChange: sinon.stub().returns({ dispose: sinon.stub() }),
        } as any

        // Stub SmusAuthenticationProvider.fromContext to return our mock
        fromContextStub = sinon.stub(SmusAuthenticationProvider, 'fromContext').returns(mockAuthProvider as any)

        // Stub executeCommand to avoid actually calling refresh
        executeCommandStub = sinon.stub(vscode.commands, 'executeCommand')
        executeCommandStub.withArgs('aws.smus.rootView.refresh').resolves()
        executeCommandStub.withArgs('aws.smus.signOut').callThrough()
    })

    afterEach(function () {
        sinon.restore()
    })

    it('disposes auth provider when signing out', async function () {
        await vscode.commands.executeCommand('aws.smus.signOut')

        assert.ok(fromContextStub.calledOnce, 'fromContext should be called once')

        assert.ok(mockAuthProvider.signOut.calledOnce, 'signOut should be called once')

        assert.ok(mockAuthProvider.dispose.calledOnce, 'dispose should be called once')

        const testWindow = getTestWindow()
        assert.ok(
            testWindow.shownMessages.some((msg) =>
                msg.message.includes('Successfully signed out from SageMaker Unified Studio.')
            ),
            'success message should be shown'
        )

        assert.ok(executeCommandStub.calledWith('aws.smus.rootView.refresh'), 'refresh command should be called')
    })
})
