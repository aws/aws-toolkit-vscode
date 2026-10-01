/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import sinon from 'sinon'
import * as vscode from 'vscode'
import { SagemakerUnifiedStudioSpaceNode } from '../../../../sagemakerunifiedstudio/explorer/nodes/sageMakerUnifiedStudioSpaceNode'
import { SageMakerUnifiedStudioSpacesParentNode } from '../../../../sagemakerunifiedstudio/explorer/nodes/sageMakerUnifiedStudioSpacesParentNode'
import { SagemakerClient, SagemakerSpaceApp } from '../../../../shared/clients/sagemaker'
import { SagemakerSpace } from '../../../../awsService/sagemaker/sagemakerSpace'

describe('SagemakerUnifiedStudioSpaceNode', function () {
    let spaceNode: SagemakerUnifiedStudioSpaceNode
    let mockParent: SageMakerUnifiedStudioSpacesParentNode
    let mockSagemakerClient: SagemakerClient
    let mockSpaceApp: SagemakerSpaceApp
    let mockSagemakerSpace: sinon.SinonStubbedInstance<SagemakerSpace>
    let trackPendingNodeStub: sinon.SinonStub

    beforeEach(function () {
        trackPendingNodeStub = sinon.stub()
        mockParent = {
            trackPendingNode: trackPendingNodeStub,
        } as any

        mockSagemakerClient = {
            describeApp: sinon.stub(),
            describeSpace: sinon.stub(),
        } as any

        mockSpaceApp = {
            SpaceName: 'test-space',
            DomainId: 'domain-123',
            Status: 'InService',
            DomainSpaceKey: 'domain-123:test-space',
            App: {
                AppName: 'test-app',
                Status: 'InService',
            },
        } as any

        mockSagemakerSpace = {
            label: 'test-space (Running)',
            description: 'Private space',
            tooltip: new vscode.MarkdownString('Space tooltip'),
            iconPath: { light: 'light-icon', dark: 'dark-icon' },
            contextValue: 'smusSpaceNode',
            updateSpace: sinon.stub(),
            setSpaceStatus: sinon.stub(),
            isPending: sinon.stub().returns(false),
            getStatus: sinon.stub().returns('Running'),
            getAppStatus: sinon.stub().resolves('InService'),
            name: 'test-space',
            arn: 'arn:aws:sagemaker:us-west-2:123456789012:space/test-space',
            getAppArn: sinon.stub().resolves('arn:aws:sagemaker:us-west-2:123456789012:app/test-app'),
            getSpaceArn: sinon.stub().resolves('arn:aws:sagemaker:us-west-2:123456789012:space/test-space'),
            updateSpaceAppStatus: sinon.stub().resolves(),
            buildTooltip: sinon.stub().returns('Space tooltip'),
            getAppIcon: sinon.stub().returns({ light: 'light-icon', dark: 'dark-icon' }),
            DomainSpaceKey: 'domain-123:test-space',
        } as any

        sinon.stub(SagemakerSpace.prototype, 'constructor' as any).returns(mockSagemakerSpace)

        spaceNode = new SagemakerUnifiedStudioSpaceNode(
            mockParent,
            mockSagemakerClient,
            'us-west-2',
            mockSpaceApp,
            true
        )

        // Replace the internal smSpace with our mock
        ;(spaceNode as any).smSpace = mockSagemakerSpace
    })

    afterEach(function () {
        sinon.restore()
    })

    describe('constructor', function () {
        it('creates instance with correct properties', function () {
            assert.strictEqual(spaceNode.id, 'smusSpaceNodetest-space')
            assert.strictEqual(spaceNode.resource, spaceNode)
            assert.strictEqual(spaceNode.regionCode, 'us-west-2')
            assert.strictEqual(spaceNode.spaceApp, mockSpaceApp)
        })
    })

    describe('getTreeItem', function () {
        it('returns correct tree item', function () {
            const treeItem = spaceNode.getTreeItem()

            assert.strictEqual(treeItem.label, 'test-space (Running)')
            assert.strictEqual(treeItem.description, 'Private space')
            assert.strictEqual(treeItem.contextValue, 'smusSpaceNode')
            assert.strictEqual(treeItem.collapsibleState, vscode.TreeItemCollapsibleState.None)
            assert.ok(treeItem.iconPath)
            assert.ok(treeItem.tooltip)
        })
    })

    describe('getChildren', function () {
        it('returns empty array', function () {
            const children = spaceNode.getChildren()
            assert.deepStrictEqual(children, [])
        })
    })

    describe('getParent', function () {
        it('returns parent node', function () {
            const parent = spaceNode.getParent()
            assert.strictEqual(parent, mockParent)
        })
    })

    describe('refreshNode', function () {
        it('fires change event', async function () {
            const emitterSpy = sinon.spy(spaceNode['onDidChangeEmitter'], 'fire')
            await spaceNode.refreshNode()
            assert(emitterSpy.calledOnce)
        })
    })

    describe('updateSpace', function () {
        it('updates space and tracks pending node when pending', function () {
            mockSagemakerSpace.isPending.returns(true)
            const newSpaceApp = { ...mockSpaceApp, Status: 'Pending' }

            spaceNode.updateSpace(newSpaceApp)

            assert(mockSagemakerSpace.updateSpace.calledWith(newSpaceApp))
            assert(trackPendingNodeStub.calledWith('domain-123:test-space'))
        })

        it('updates space without tracking when not pending', function () {
            mockSagemakerSpace.isPending.returns(false)
            const newSpaceApp = { ...mockSpaceApp, Status: 'InService' }

            spaceNode.updateSpace(newSpaceApp)

            assert(mockSagemakerSpace.updateSpace.calledWith(newSpaceApp))
            assert(trackPendingNodeStub.notCalled)
        })
    })

    describe('setSpaceStatus', function () {
        it('delegates to SagemakerSpace', function () {
            spaceNode.setSpaceStatus('InService', 'Running')
            assert(mockSagemakerSpace.setSpaceStatus.calledWith('InService', 'Running'))
        })
    })

    describe('isPending', function () {
        it('delegates to SagemakerSpace', function () {
            const result = spaceNode.isPending()
            assert(mockSagemakerSpace.isPending.called)
            assert.strictEqual(result, false)
        })
    })

    describe('getStatus', function () {
        it('delegates to SagemakerSpace', function () {
            const result = spaceNode.getStatus()
            assert(mockSagemakerSpace.getStatus.called)
            assert.strictEqual(result, 'Running')
        })
    })

    describe('getAppStatus', function () {
        it('delegates to SagemakerSpace', async function () {
            const result = await spaceNode.getAppStatus()
            assert(mockSagemakerSpace.getAppStatus.called)
            assert.strictEqual(result, 'InService')
        })
    })

    describe('name property', function () {
        it('returns space name', function () {
            assert.strictEqual(spaceNode.name, 'test-space')
        })
    })

    describe('arn property', function () {
        it('returns space arn', function () {
            assert.strictEqual(spaceNode.arn, 'arn:aws:sagemaker:us-west-2:123456789012:space/test-space')
        })
    })

    describe('getAppArn', function () {
        it('delegates to SagemakerSpace', async function () {
            const result = await spaceNode.getAppArn()
            assert(mockSagemakerSpace.getAppArn.called)
            assert.strictEqual(result, 'arn:aws:sagemaker:us-west-2:123456789012:app/test-app')
        })
    })

    describe('getSpaceArn', function () {
        it('delegates to SagemakerSpace', async function () {
            const result = await spaceNode.getSpaceArn()
            assert(mockSagemakerSpace.getSpaceArn.called)
            assert.strictEqual(result, 'arn:aws:sagemaker:us-west-2:123456789012:space/test-space')
        })
    })

    describe('updateSpaceAppStatus', function () {
        it('updates status and tracks pending node when pending', async function () {
            mockSagemakerSpace.isPending.returns(true)

            await spaceNode.updateSpaceAppStatus()

            assert(mockSagemakerSpace.updateSpaceAppStatus.called)
            assert(trackPendingNodeStub.calledWith('domain-123:test-space'))
        })

        it('updates status without tracking when not pending', async function () {
            mockSagemakerSpace.isPending.returns(false)

            await spaceNode.updateSpaceAppStatus()

            assert(mockSagemakerSpace.updateSpaceAppStatus.called)
            assert(trackPendingNodeStub.notCalled)
        })
    })

    describe('buildTooltip', function () {
        it('delegates to SagemakerSpace', function () {
            const result = spaceNode.buildTooltip()
            assert(mockSagemakerSpace.buildTooltip.called)
            assert.strictEqual(result, 'Space tooltip')
        })
    })

    describe('getAppIcon', function () {
        it('delegates to SagemakerSpace', function () {
            const result = spaceNode.getAppIcon()
            assert(mockSagemakerSpace.getAppIcon.called)
            assert.deepStrictEqual(result, { light: 'light-icon', dark: 'dark-icon' })
        })
    })

    describe('DomainSpaceKey property', function () {
        it('returns domain space key', function () {
            assert.strictEqual(spaceNode.DomainSpaceKey, 'domain-123:test-space')
        })
    })

    describe('SagemakerSpace getContext for SMUS', function () {
        it('returns awsSagemakerSpaceRunningNode for running SMUS space with undefined RemoteAccess', function () {
            // Create a space app without RemoteAccess setting (undefined)
            const smusSpaceApp = {
                SpaceName: 'test-space',
                DomainId: 'domain-123',
                Status: 'InService',
                DomainSpaceKey: 'domain-123:test-space',
                App: {
                    AppName: 'test-app',
                    Status: 'InService',
                },
                SpaceSettingsSummary: {
                    // RemoteAccess is undefined
                },
            } as any

            // Create a real SagemakerSpace instance for SMUS to test the actual getContext logic
            const realSagemakerSpace = new SagemakerSpace(
                mockSagemakerClient,
                'us-west-2',
                smusSpaceApp,
                true // isSMUSSpace = true
            )

            const context = realSagemakerSpace.getContext()

            assert.strictEqual(context, 'awsSagemakerSpaceRunningNode')
        })
    })
})
