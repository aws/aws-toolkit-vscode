/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as assert from 'assert'
import { FakeWindow } from '../../shared/vscode/fakeWindow'
import { AwsResourceManager, TypeSchema } from '../../../dynamicResources/awsResourceManager'
import { instance, mock } from 'ts-mockito'
import { when, verify } from '../../utilities/mockito'
import { ResourceNode } from '../../../dynamicResources/explorer/nodes/resourceNode'
import { ResourceTypeNode } from '../../../dynamicResources/explorer/nodes/resourceTypeNode'
import { getDiagnostics, openResource } from '../../../dynamicResources/commands/openResource'

describe('openResource', function () {
    const fakeType = 'fakeType'
    const fakeIdentifier = 'fakeIdentifier'
    let mockResourceManager: AwsResourceManager
    let mockDiagnosticCollection: vscode.DiagnosticCollection
    const fakeResourceNode = new ResourceNode({ typeName: fakeType } as ResourceTypeNode, fakeIdentifier)

    beforeEach(function () {
        mockResourceManager = mock()
        mockDiagnosticCollection = mock()
    })

    it('shows progress', async function () {
        const window = new FakeWindow()
        when(mockResourceManager.open(fakeResourceNode, false)).thenResolve()
        await openResource(
            {
                source: fakeResourceNode,
                preview: false,
                resourceManager: instance(mockResourceManager),
                diagnostics: mockDiagnosticCollection,
            },
            window
        )
        assert.strictEqual(window.progress.options?.location, vscode.ProgressLocation.Notification)
        assert.strictEqual(window.progress.options?.cancellable, false)
        assert.deepStrictEqual(window.progress.reported, [
            { message: `Opening resource ${fakeIdentifier} (${fakeType})...` },
        ])
    })

    it('shows an error message when opening resource fails', async function () {
        const window = new FakeWindow()
        when(mockResourceManager.open(fakeResourceNode, false)).thenThrow(new Error())
        await openResource(
            {
                source: fakeResourceNode,
                preview: false,
                resourceManager: instance(mockResourceManager),
                diagnostics: mockDiagnosticCollection,
            },
            window
        )
        assert.ok(window.message.error?.startsWith(`Failed to open resource ${fakeIdentifier} (${fakeType})`))
    })

    it('handles opening ResourceNodes', async function () {
        const window = new FakeWindow()
        when(mockResourceManager.open(fakeResourceNode, false)).thenResolve()
        await openResource(
            {
                source: fakeResourceNode,
                preview: false,
                resourceManager: instance(mockResourceManager),
                diagnostics: mockDiagnosticCollection,
            },
            window
        )
        verify(mockResourceManager.open(fakeResourceNode, false)).once()
    })

    it('handles opening uris', async function () {
        const window = new FakeWindow()
        const fakeUri = vscode.Uri.parse('foo')
        when(mockResourceManager.fromUri(fakeUri)).thenReturn(fakeResourceNode)
        when(mockResourceManager.open(fakeResourceNode, false)).thenResolve()
        await openResource(
            {
                source: fakeUri,
                preview: false,
                resourceManager: instance(mockResourceManager),
                diagnostics: mockDiagnosticCollection,
            },
            window
        )
        verify(mockResourceManager.fromUri(fakeUri)).once()
        verify(mockResourceManager.open(fakeResourceNode, false)).once()
    })

    it('can open in preview mode', async function () {
        const window = new FakeWindow()
        when(mockResourceManager.open(fakeResourceNode, true)).thenResolve()
        await openResource(
            {
                source: fakeResourceNode,
                preview: true,
                resourceManager: instance(mockResourceManager),
                diagnostics: mockDiagnosticCollection,
            },
            window
        )
        verify(mockResourceManager.open(fakeResourceNode, true)).once()
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
