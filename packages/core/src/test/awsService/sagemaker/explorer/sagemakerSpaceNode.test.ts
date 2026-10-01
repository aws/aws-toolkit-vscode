/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as sinon from 'sinon'
import assert from 'assert'
import { AppType } from '@aws-sdk/client-sagemaker'
import { SagemakerClient, SagemakerSpaceApp } from '../../../../shared/clients/sagemaker'
import { SagemakerSpaceNode } from '../../../../awsService/sagemaker/explorer/sagemakerSpaceNode'
import { SagemakerStudioNode } from '../../../../awsService/sagemaker/explorer/sagemakerStudioNode'
import { PollingSet } from '../../../../shared/utilities/pollingSet'

describe('SagemakerSpaceNode', function () {
    const testRegion = 'testRegion'
    let client: SagemakerClient
    let testParent: SagemakerStudioNode
    let testSpaceApp: SagemakerSpaceApp
    let describeAppStub: sinon.SinonStub
    let testSpaceAppNode: SagemakerSpaceNode

    beforeEach(function () {
        testSpaceApp = {
            SpaceName: 'TestSpace',
            DomainId: 'd-12345',
            App: { AppName: 'TestApp', Status: 'InService' },
            SpaceSettingsSummary: { AppType: AppType.JupyterLab },
            OwnershipSettingsSummary: { OwnerUserProfileName: 'test-user' },
            SpaceSharingSettingsSummary: { SharingType: 'Private' },
            Status: 'InService',
            DomainSpaceKey: '123',
        }

        sinon.stub(PollingSet.prototype, 'add')
        client = new SagemakerClient(testRegion)
        testParent = new SagemakerStudioNode(testRegion, client)

        describeAppStub = sinon.stub(SagemakerClient.prototype, 'describeApp')
        testSpaceAppNode = new SagemakerSpaceNode(testParent, client, testRegion, testSpaceApp)
    })

    afterEach(function () {
        sinon.restore()
    })

    it('initializes with correct label, description, and tooltip', function () {
        const node = new SagemakerSpaceNode(testParent, client, testRegion, testSpaceApp)

        assert.strictEqual(node.label, 'TestSpace (Running)')
        assert.strictEqual(node.description, 'Private space')
        assert.ok(node.tooltip instanceof vscode.MarkdownString)
        assert.ok((node.tooltip as vscode.MarkdownString).value.includes('**Space:** TestSpace'))
    })

    it('falls back to defaults if optional fields are missing', function () {
        const partialApp: SagemakerSpaceApp = {
            SpaceName: undefined,
            DomainId: 'domainId',
            Status: 'Failed',
            DomainSpaceKey: '123',
        }

        const node = new SagemakerSpaceNode(testParent, client, testRegion, partialApp)

        assert.strictEqual(node.label, '(no name) (Failed)')
        assert.strictEqual(node.description, 'Unknown space')
        assert.ok((node.tooltip as vscode.MarkdownString).value.includes('**Space:** -'))
    })

    it('returns ARN from describeApp', async function () {
        describeAppStub.resolves({ AppArn: 'arn:aws:sagemaker:1234:app/TestApp', $metadata: {} })

        const arn = await testSpaceAppNode.getAppArn()

        assert.strictEqual(arn, 'arn:aws:sagemaker:1234:app/TestApp')
        sinon.assert.calledOnce(describeAppStub)
        sinon.assert.calledWithExactly(describeAppStub, {
            DomainId: 'd-12345',
            AppName: 'TestApp',
            AppType: AppType.JupyterLab,
            SpaceName: 'TestSpace',
        })
    })

    it('returns space ARN from describeSpace', async function () {
        const describeSpaceStub = sinon.stub(SagemakerClient.prototype, 'describeSpace')
        describeSpaceStub.resolves({ SpaceArn: 'arn:aws:sagemaker:1234:space/TestSpace', $metadata: {} })

        const arn = await testSpaceAppNode.getSpaceArn()

        assert.strictEqual(arn, 'arn:aws:sagemaker:1234:space/TestSpace')
        sinon.assert.calledOnce(describeSpaceStub)
    })

    it('updates status with new spaceApp', function () {
        const newSpaceApp = { ...testSpaceApp, App: { AppName: 'TestApp', Status: 'Pending' } } as SagemakerSpaceApp
        testSpaceAppNode.updateSpace(newSpaceApp)
        assert.strictEqual(testSpaceAppNode.getStatus(), 'Starting')
    })

    it('delegates to SagemakerSpace for properties', function () {
        const node = new SagemakerSpaceNode(testParent, client, testRegion, testSpaceApp)

        // Verify that properties are managed by SagemakerSpace
        assert.strictEqual(node.name, 'TestSpace')
        assert.strictEqual(node.label, 'TestSpace (Running)')
        assert.strictEqual(node.description, 'Private space')
        assert.ok(node.tooltip instanceof vscode.MarkdownString)
    })

    it('updates space app status', async function () {
        const describeSpaceStub = sinon.stub(SagemakerClient.prototype, 'describeSpace')
        describeSpaceStub.resolves({ SpaceName: 'TestSpace', Status: 'InService', $metadata: {} })

        const listAppsMatchSpaceStub = sinon.stub(SagemakerClient.prototype, 'listAppsForDomainMatchSpaceIgnoreCase')
        listAppsMatchSpaceStub.resolves({ AppName: 'TestApp', Status: 'InService' })

        await testSpaceAppNode.updateSpaceAppStatus()

        sinon.assert.calledOnce(describeSpaceStub)
        sinon.assert.calledOnce(listAppsMatchSpaceStub)
    })
})
