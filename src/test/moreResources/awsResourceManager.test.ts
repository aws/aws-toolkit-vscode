/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { MoreResourcesNode, ResourceMetadata } from '../../moreResources/explorer/nodes/moreResourcesNode'
import { ResourceNode } from '../../moreResources/explorer/nodes/resourceNode'
import { ResourceTypeNode } from '../../moreResources/explorer/nodes/resourceTypeNode'
import { formatResourceModel, AwsResourceManager } from '../../moreResources/awsResourceManager'
import { CloudControlClient } from '../../shared/clients/cloudControlClient'
import { CloudFormationClient } from '../../shared/clients/cloudFormationClient'
import { readFileAsString } from '../../shared/filesystemUtilities'
import { deepEqual, instance, mock, when } from '../utilities/mockito'
import { FakeExtensionContext } from '../fakeExtensionContext'

describe('ResourceManager', function () {
    let sandbox: sinon.SinonSandbox
    let cloudFormation: CloudFormationClient
    let cloudControl: CloudControlClient
    let resourceNode: ResourceNode
    let resourceTypeNode: ResourceTypeNode
    let resourceManager: AwsResourceManager

    const FAKE_TYPE_NAME = 'sometype'
    const FAKE_IDENTIFIER = 'someidentifier'
    const FAKE_REGION = 'someregion'

    const fakeResourceDescription = {
        Role: 'arn:aws:iam::1234:role/service-role/fooResource',
        Name: 'fooResource',
        ANestedType: {
            Type: 'string',
            Value: 'FooBar',
        },
        ArrayType: ['foo', 'bar', 'baz'],
    }

    beforeEach(async function () {
        cloudControl = mock()
        cloudFormation = mock()
        sandbox = sinon.createSandbox()
        mockClients()

        const rootNode = new MoreResourcesNode(FAKE_REGION, cloudFormation, cloudControl)
        resourceTypeNode = new ResourceTypeNode(
            rootNode,
            FAKE_TYPE_NAME,
            instance(cloudControl),
            {} as ResourceMetadata
        )
        resourceNode = new ResourceNode(resourceTypeNode, FAKE_IDENTIFIER)
        resourceManager = new AwsResourceManager(new FakeExtensionContext())
    })

    afterEach(async function () {
        sandbox.restore()
        await resourceManager.dispose()
    })

    it('opens resources in preview mode', async function () {
        const mockTextDocument = {} as vscode.TextDocument
        const mockTextEditor = {} as vscode.TextEditor
        const openTextDocumentStub = sandbox.stub(vscode.workspace, 'openTextDocument').resolves(mockTextDocument)
        const showTextDocumentStub = sandbox.stub(vscode.window, 'showTextDocument').resolves(mockTextEditor)

        const editor = await resourceManager.open(resourceNode, true)

        const capturedUri = openTextDocumentStub.getCall(0).args[0] as vscode.Uri

        assert.strictEqual(capturedUri.scheme, 'awsResource')
        assert.strictEqual(capturedUri.path, `${FAKE_IDENTIFIER}.${FAKE_TYPE_NAME}.preview.json`)
        assert.strictEqual(capturedUri.query, formatResourceModel(JSON.stringify(fakeResourceDescription)))

        assert.strictEqual(showTextDocumentStub.getCall(0).args[0], mockTextDocument)
        assert.deepStrictEqual(showTextDocumentStub.getCall(0).args[1], { preview: true })

        assert.strictEqual(editor, mockTextEditor)
    })

    it('opens resources in edit mode', async function () {
        const mockTextDocument = {} as vscode.TextDocument
        const mockTextEditor = {} as vscode.TextEditor
        const openTextDocumentStub = sandbox.stub(vscode.workspace, 'openTextDocument').resolves(mockTextDocument)
        const showTextDocumentStub = sandbox.stub(vscode.window, 'showTextDocument').resolves(mockTextEditor)

        const editor = await resourceManager.open(resourceNode, false)

        const capturedUri = openTextDocumentStub.getCall(0).args[0] as vscode.Uri

        assert.strictEqual(capturedUri.scheme, 'file')
        assert.strictEqual(capturedUri.path.endsWith(`${FAKE_IDENTIFIER}.${FAKE_TYPE_NAME}.awsResource.json`), true)

        const fileContents = JSON.parse(await readFileAsString(capturedUri.path))
        assert.deepStrictEqual(fileContents, fakeResourceDescription)

        assert.strictEqual(showTextDocumentStub.getCall(0).args[0], mockTextDocument)
        assert.deepStrictEqual(showTextDocumentStub.getCall(0).args[1], { preview: false })

        assert.strictEqual(editor, mockTextEditor)
    })

    it('closes existing document when reopening resource', async function () {
        const mockTextDocument = {} as vscode.TextDocument
        const mockTextEditor = {
            document: mockTextDocument,
        } as vscode.TextEditor
        const openTextDocumentStub = sandbox.stub(vscode.workspace, 'openTextDocument').resolves(mockTextDocument)
        sandbox.stub(vscode.window, 'showTextDocument').resolves(mockTextEditor)

        await resourceManager.open(resourceNode, true)
        const capturedUri = openTextDocumentStub.getCall(0).args[0] as vscode.Uri
        assert.strictEqual(resourceManager.fromUri(capturedUri), resourceNode)

        await resourceManager.open(resourceNode, false)
        assert.strictEqual(resourceManager.fromUri(capturedUri), undefined)
    })

    it('creates new resource documents', async function () {
        const mockTextLine = {
            range: new vscode.Range(0, 0, 0, 0),
        }
        const mockTextDocument: vscode.TextDocument = {
            lineAt: () => mockTextLine,
        } as any as vscode.TextDocument
        const mockTextEditor = {
            document: mockTextDocument,
        } as vscode.TextEditor
        const openTextDocumentStub = sandbox.stub(vscode.workspace, 'openTextDocument').resolves(mockTextDocument)
        const showTextDocumentStub = sandbox.stub(vscode.window, 'showTextDocument').resolves(mockTextEditor)

        const editor = await resourceManager.new(resourceTypeNode)

        const capturedUri = openTextDocumentStub.getCall(0).args[0] as vscode.Uri

        assert.strictEqual(capturedUri.scheme, 'file')
        assert.strictEqual(capturedUri.path.endsWith(`new.${FAKE_TYPE_NAME}.awsResource.json`), true)

        const fileContents = JSON.parse(await readFileAsString(capturedUri.path))
        assert.deepStrictEqual(fileContents, {})

        assert.strictEqual(showTextDocumentStub.getCall(0).args[0], mockTextDocument)
        assert.deepStrictEqual(showTextDocumentStub.getCall(0).args[1], { preview: false })

        assert.strictEqual(editor, mockTextEditor)
    })

    it('returns existing resource from uri', async function () {
        const editor = await resourceManager.open(resourceNode, false)
        assert.strictEqual(resourceManager.fromUri(editor.document.uri), resourceNode)
    })

    it('returns undefined for non-existent resource from uri', function () {
        assert.strictEqual(resourceManager.fromUri(vscode.Uri.parse('foo')), undefined)
    })

    it('returns existing resource uri from resource node', async function () {
        const editor = await resourceManager.open(resourceNode, false)
        assert.strictEqual(resourceManager.toUri(resourceNode)?.fsPath, editor.document.uri.fsPath)
    })

    it('returns undefined for non-existent resource from resource node', function () {
        assert.strictEqual(resourceManager.toUri(resourceNode), undefined)
    })

    function mockClients(): void {
        when(
            cloudControl.getResource(
                deepEqual({
                    TypeName: FAKE_TYPE_NAME,
                    Identifier: FAKE_IDENTIFIER,
                })
            )
        ).thenResolve({
            TypeName: 'foo',
            ResourceDescription: {
                Identifier: 'bar',
                Properties: JSON.stringify(fakeResourceDescription),
            },
        })
        when(cloudFormation.describeType(FAKE_TYPE_NAME)).thenResolve({})
    }
})
