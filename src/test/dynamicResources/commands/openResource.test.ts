/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import assert from 'assert'
import { AwsResourceManager, TypeSchema } from '../../../dynamicResources/awsResourceManager'
import { ResourceNode } from '../../../dynamicResources/explorer/nodes/resourceNode'
import { ResourceTypeNode } from '../../../dynamicResources/explorer/nodes/resourceTypeNode'
import { getDiagnostics, openResource } from '../../../dynamicResources/commands/openResource'
import { getTestWindow } from '../../shared/vscode/window'
import { Stub, stub } from '../../utilities/stubber'
import sinon from 'sinon'

describe('openResource', function () {
    const fakeType = 'fakeType'
    const fakeIdentifier = 'fakeIdentifier'
    let mockResourceManager: Stub<AwsResourceManager>
    let mockDiagnosticCollection: vscode.DiagnosticCollection
    const fakeResourceNode = new ResourceNode({ typeName: fakeType } as ResourceTypeNode, fakeIdentifier)

    beforeEach(function () {
        mockResourceManager = stub(AwsResourceManager)
        mockDiagnosticCollection = {} as any as vscode.DiagnosticCollection
    })

    it('shows progress', async function () {
        mockResourceManager.open = sinon.stub()
        await openResource({
            source: fakeResourceNode,
            preview: false,
            resourceManager: mockResourceManager,
            diagnostics: mockDiagnosticCollection,
        })
        const progress = getTestWindow().getFirstMessage()
        assert.ok(!progress.cancellable)
        assert(mockResourceManager.open.calledOnceWithExactly(fakeResourceNode, false))
        assert.deepStrictEqual(progress.progressReports, [
            { message: `Opening resource ${fakeIdentifier} (${fakeType})...` },
        ])
    })

    it('shows an error message when opening resource fails', async function () {
        mockResourceManager.open = sinon.stub()
        mockResourceManager.open.rejects()
        await openResource({
            source: fakeResourceNode,
            preview: false,
            resourceManager: mockResourceManager,
            diagnostics: mockDiagnosticCollection,
        })
        getTestWindow().getSecondMessage().assertError(`Failed to open resource ${fakeIdentifier} (${fakeType})`)
    })

    it('handles opening ResourceNodes', async function () {
        mockResourceManager.open = sinon.stub()
        await openResource({
            source: fakeResourceNode,
            preview: false,
            resourceManager: mockResourceManager,
            diagnostics: mockDiagnosticCollection,
        })
        assert(mockResourceManager.open.calledOnceWithExactly(fakeResourceNode, false))
    })

    it('handles opening uris', async function () {
        const fakeUri = vscode.Uri.parse('foo')
        mockResourceManager.open = sinon.stub()
        mockResourceManager.fromUri = sinon.stub()
        mockResourceManager.fromUri.returns(fakeResourceNode)
        await openResource({
            source: fakeUri,
            preview: false,
            resourceManager: mockResourceManager,
            diagnostics: mockDiagnosticCollection,
        })
        assert(mockResourceManager.fromUri.calledOnceWithExactly(fakeUri))
        assert(mockResourceManager.open.calledOnceWithExactly(fakeResourceNode, false))
    })

    it('can open in preview mode', async function () {
        mockResourceManager.open = sinon.stub()
        await openResource({
            source: fakeResourceNode,
            preview: true,
            resourceManager: mockResourceManager,
            diagnostics: mockDiagnosticCollection,
        })
        assert(mockResourceManager.open.calledOnceWithExactly(fakeResourceNode, true))
    })

    it('generates diagnostics for read-only properties', async function () {
        const schema = getFakeTypeSchema({ readOnlyProperties: ['fooProperty'] })
        const fakeDefinition = JSON.stringify({
            fooProperty: 'foo',
            barProperty: 'bar',
        })
        const document = await vscode.workspace.openTextDocument({
            content: fakeDefinition,
        })

        const diagnostics = getDiagnostics(schema, document)
        assert.strictEqual(diagnostics.length, 1)

        const diagnostic = diagnostics[0]
        assert.strictEqual(diagnostic.severity, vscode.DiagnosticSeverity.Information)
        assert.strictEqual(diagnostic.message, '"fooProperty" is a read-only property and cannot be modified')
    })

    it('generates diagnostics for create-only properties', async function () {
        const schema = getFakeTypeSchema({ createOnlyProperties: ['barProperty'] })
        const fakeDefinition = JSON.stringify({
            fooProperty: 'foo',
            barProperty: 'bar',
        })
        const document = await vscode.workspace.openTextDocument({
            content: fakeDefinition,
        })

        const diagnostics = getDiagnostics(schema, document)
        assert.strictEqual(diagnostics.length, 1)

        const diagnostic = diagnostics[0]
        assert.strictEqual(diagnostic.severity, vscode.DiagnosticSeverity.Information)
        assert.strictEqual(
            diagnostic.message,
            '"barProperty" is a create-only property and cannot be modified on an existing resource'
        )
    })

    it('returns no diagnostics for no matching properties', async function () {
        const schema = getFakeTypeSchema({ createOnlyProperties: ['bazProperty'] })
        const fakeDefinition = JSON.stringify({
            fooProperty: 'foo',
            barProperty: 'bar',
        })
        const document = await vscode.workspace.openTextDocument({
            content: fakeDefinition,
        })

        const diagnostics = getDiagnostics(schema, document)
        assert.strictEqual(diagnostics.length, 0)
    })
})

function getFakeTypeSchema(opts: { readOnlyProperties?: string[]; createOnlyProperties?: string[] }): TypeSchema {
    return {
        typeName: '',
        description: '',
        properties: undefined,
        definitions: undefined,
        readOnlyProperties: opts.readOnlyProperties ?? [],
        createOnlyProperties: opts.createOnlyProperties ?? [],
        writeOnlyProperties: [],
        required: [],
        primaryIdentifier: [],
    }
}
