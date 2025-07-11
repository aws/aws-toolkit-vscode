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
import { getTestWindow } from '../../../shared/vscode/window'

describe('SageMakerUnifiedStudioProjectNode', function () {
    let projectNode: SageMakerUnifiedStudioProjectNode
    let mockDataZoneClient: sinon.SinonStubbedInstance<DataZoneClient>
    let telemetryStub: sinon.SinonStub

    const mockProject: DataZoneProject = {
        id: 'project-123',
        name: 'Test Project',
        description: 'Test Description',
        domainId: 'domain-123',
    }

    const mockCredentials = {
        accessKeyId: 'AKIATEST',
        secretAccessKey: 'secret',
        sessionToken: 'token',
        $metadata: {},
    }

    beforeEach(function () {
        projectNode = new SageMakerUnifiedStudioProjectNode('sageMakerUnifiedStudioProject-project-123', mockProject)

        sinon.stub(getLogger(), 'info')
        sinon.stub(getLogger(), 'warn')

        // Stub telemetry
        telemetryStub = sinon.stub(telemetry, 'record')

        // Create mock DataZone client
        mockDataZoneClient = {
            getProjectDefaultEnvironmentCreds: sinon.stub(),
        } as any

        // Stub DataZoneClient static methods
        sinon.stub(DataZoneClient, 'getInstance').returns(mockDataZoneClient as any)
    })

    afterEach(function () {
        sinon.restore()
    })

    describe('constructor', function () {
        it('creates instance with correct properties', function () {
            assert.strictEqual(projectNode.id, 'sageMakerUnifiedStudioProject-project-123')
            assert.strictEqual(projectNode.resource, mockProject)
        })
    })

    describe('getTreeItem', function () {
        it('returns correct tree item', async function () {
            const treeItem = projectNode.getTreeItem()

            assert.strictEqual(treeItem.label, 'Test Project')
            assert.strictEqual(treeItem.collapsibleState, vscode.TreeItemCollapsibleState.Collapsed)
            assert.strictEqual(treeItem.contextValue, 'sageMakerUnifiedStudioProject')
            assert.ok(treeItem.iconPath)
        })
    })

    describe('getParent', function () {
        it('returns undefined', function () {
            assert.strictEqual(projectNode.getParent(), undefined)
        })
    })

    describe('getChildren', function () {
        it('stores config and gets credentials successfully', async function () {
            mockDataZoneClient.getProjectDefaultEnvironmentCreds.resolves(mockCredentials)

            const children = await projectNode.getChildren()

            // Verify credentials were retrieved
            assert(
                mockDataZoneClient.getProjectDefaultEnvironmentCreds.calledOnceWith(
                    mockProject.domainId,
                    mockProject.id
                )
            )

            // Verify success message
            const testWindow = getTestWindow()
            await testWindow.waitForMessage(`Selected project: ${mockProject.name}.`)

            // Verify telemetry
            assert(
                telemetryStub.calledWith({
                    name: 'smus_selectProject',
                    result: 'Succeeded',
                    passive: false,
                })
            )

            // Verify placeholder child is returned
            assert.strictEqual(children.length, 1)
            assert.strictEqual(children[0].id, 'sageMakerUnifiedStudioProjectChild')
        })

        it('handles credentials error gracefully', async function () {
            const credError = new Error('Credentials failed')
            mockDataZoneClient.getProjectDefaultEnvironmentCreds.rejects(credError)

            const children = await projectNode.getChildren()

            const testWindow = getTestWindow()
            await testWindow.waitForMessage(`Selected project: ${mockProject.name}.`)

            assert.strictEqual(children.length, 1)
        })
    })
})
