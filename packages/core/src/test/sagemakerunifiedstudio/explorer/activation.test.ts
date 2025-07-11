/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import sinon from 'sinon'
import * as vscode from 'vscode'
import { activate } from '../../../sagemakerunifiedstudio/explorer/activation'
import { ResourceTreeDataProvider } from '../../../shared/treeview/resourceTreeDataProvider'
import { FakeExtensionContext } from '../../fakeExtensionContext'
import { retrySmusProjectsCommand } from '../../../sagemakerunifiedstudio/explorer/nodes/sageMakerUnifiedStudioRootNode'

describe('SageMaker Unified Studio explorer activation', function () {
    let mockContext: FakeExtensionContext
    let createTreeViewStub: sinon.SinonStub
    let registerCommandStub: sinon.SinonStub
    let mockTreeView: sinon.SinonStubbedInstance<vscode.TreeView<any>>
    let mockTreeDataProvider: sinon.SinonStubbedInstance<ResourceTreeDataProvider>

    beforeEach(async function () {
        mockContext = await FakeExtensionContext.create()

        // Create mock tree view
        mockTreeView = {
            dispose: sinon.stub(),
        } as any

        // Create mock tree data provider
        mockTreeDataProvider = {
            refresh: sinon.stub(),
        } as any

        // Stub vscode methods
        createTreeViewStub = sinon.stub(vscode.window, 'createTreeView').returns(mockTreeView as any)
        registerCommandStub = sinon.stub(vscode.commands, 'registerCommand').returns({ dispose: sinon.stub() } as any)

        // Stub ResourceTreeDataProvider constructor
        sinon.stub(ResourceTreeDataProvider.prototype, 'refresh').callsFake(mockTreeDataProvider.refresh)
    })

    afterEach(function () {
        sinon.restore()
    })

    it('creates tree view with correct configuration', async function () {
        await activate(mockContext)

        // Verify tree view was created with correct view ID
        assert(createTreeViewStub.calledOnce)
        const [viewId, options] = createTreeViewStub.firstCall.args
        assert.strictEqual(viewId, 'aws.smus.projectsView')
        assert.ok(options.treeDataProvider)
    })

    it('registers refresh command', async function () {
        await activate(mockContext)

        // Verify refresh command was registered
        assert(registerCommandStub.calledWith('aws.smus.projectsView.refresh', sinon.match.func))
    })

    it('registers retry command', async function () {
        const registerStub = sinon.stub(retrySmusProjectsCommand, 'register').returns({ dispose: sinon.stub() } as any)

        await activate(mockContext)

        // Verify retry command was registered
        assert(registerStub.calledOnce)
    })

    it('adds subscriptions to extension context', async function () {
        await activate(mockContext)

        // Verify subscriptions were added (retry command, tree view, refresh command)
        assert.strictEqual(mockContext.subscriptions.length, 3)
    })

    it('refreshes tree data provider on activation', async function () {
        await activate(mockContext)

        // Verify tree data provider was refreshed
        assert(mockTreeDataProvider.refresh.calledOnce)
    })

    it('refresh command triggers tree data provider refresh', async function () {
        await activate(mockContext)

        // Get the registered refresh command function
        const refreshCommandCall = registerCommandStub
            .getCalls()
            .find((call) => call.args[0] === 'aws.smus.projectsView.refresh')
        assert.ok(refreshCommandCall, 'Refresh command should be registered')

        const refreshFunction = refreshCommandCall.args[1]

        // Execute the refresh command
        refreshFunction()

        // Verify tree data provider refresh was called again (once on activation, once on command)
        assert(mockTreeDataProvider.refresh.calledTwice)
    })
})
