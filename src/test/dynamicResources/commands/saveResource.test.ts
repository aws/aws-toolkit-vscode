/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as assert from 'assert'
import { FakeWindow } from '../../shared/vscode/fakeWindow'
import { instance, mock, when, verify, anything, deepEqual } from 'ts-mockito'
import { createResource, updateResource } from '../../../dynamicResources/commands/saveResource'
import { AddOperation } from 'fast-json-patch'
import { CloudControlClient } from '../../../shared/clients/cloudControlClient'

describe('createResource', function () {
    const fakeType = 'fakeType'
    const fakeDefinition = '{}'

    let mockCloudControl: CloudControlClient

    beforeEach(function () {
        mockCloudControl = mock()
    })

    it('creates resources, shows progress and confirmation', async function () {
        const window = new FakeWindow()
        const newIdentifier = 'newIdentifier'

        when(
            mockCloudControl.createResource(
                deepEqual({
                    TypeName: fakeType,
                    DesiredState: fakeDefinition,
                })
            )
        ).thenResolve({
            ProgressEvent: {
                Identifier: newIdentifier,
            },
        })

        await createResource(fakeType, fakeDefinition, instance(mockCloudControl), window)

        verify(
            mockCloudControl.createResource(
                deepEqual({
                    TypeName: fakeType,
                    DesiredState: fakeDefinition,
                })
            )
        ).once()
        assert.strictEqual(window.progress.options?.location, vscode.ProgressLocation.Notification)
        assert.strictEqual(window.progress.options?.cancellable, false)
        assert.deepStrictEqual(window.progress.reported, [{ message: `Creating resource (${fakeType})...` }])

        assert.ok(window.message.information?.startsWith(`Created resource ${newIdentifier} (${fakeType})`))
    })

    it('shows an error message when resource creation fails', async function () {
        when(
            mockCloudControl.createResource(
                deepEqual({
                    TypeName: fakeType,
                    DesiredState: fakeDefinition,
                })
            )
        ).thenReject(new Error())
        const window = new FakeWindow()

        try {
            await createResource(fakeType, fakeDefinition, instance(mockCloudControl), window)
        } catch (err) {
            assert.ok(window.message.error?.startsWith(`Failed to create resource (${fakeType})`))
            return
        }
        assert.fail('Expected exception, but none was thrown.')
    })

    it('shows an error message when definition is not valid json', async function () {
        const window = new FakeWindow()
        try {
            await createResource(fakeType, 'foo', instance(mockCloudControl), window)
        } catch (err) {
            verify(mockCloudControl.createResource(anything())).never()
            assert.ok(window.message.error?.startsWith(`Failed to create resource (${fakeType})`))
            return
        }
        assert.fail('Expected exception, but none was thrown.')
    })

    it('shows a warning if unsupported action', async function () {
        const error = new Error('fake exception')
        error.name = 'UnsupportedActionException'
        when(
            mockCloudControl.createResource(
                deepEqual({
                    TypeName: fakeType,
                    DesiredState: fakeDefinition,
                })
            )
        ).thenReject(error)
        const window = new FakeWindow()

        await createResource(fakeType, fakeDefinition, instance(mockCloudControl), window)

        assert.ok(window.message.warning?.startsWith(`${fakeType} does not currently support resource creation`))
    })
})

describe('updateResource', function () {
    const fakeType = 'fakeType'
    const fakeIdentifier = 'fakeIdentifier'
    const fakeDefinition = '{}'
    const fakeOperation = { op: 'add', value: 'Foo' } as AddOperation<string>
    const fakeDiff = [fakeOperation]

    let mockCloudControl: CloudControlClient

    beforeEach(function () {
        mockCloudControl = mock()
    })

    it('updates resources, shows progress and confirmation', async function () {
        const window = new FakeWindow()
        const patchJson = JSON.stringify(fakeDiff)

        when(
            mockCloudControl.updateResource(
                deepEqual({
                    TypeName: fakeType,
                    Identifier: fakeIdentifier,
                    PatchDocument: patchJson,
                })
            )
        ).thenResolve()

        await updateResource(fakeType, fakeIdentifier, fakeDefinition, instance(mockCloudControl), window, fakeDiff)

        verify(
            mockCloudControl.updateResource(
                deepEqual({
                    TypeName: fakeType,
                    Identifier: fakeIdentifier,
                    PatchDocument: patchJson,
                })
            )
        ).once()
        assert.strictEqual(window.progress.options?.location, vscode.ProgressLocation.Notification)
        assert.strictEqual(window.progress.options?.cancellable, false)
        assert.deepStrictEqual(window.progress.reported, [
            { message: `Updating resource ${fakeIdentifier} (${fakeType})...` },
        ])

        assert.ok(window.message.information?.startsWith(`Updated resource ${fakeIdentifier} (${fakeType})`))
    })

    it('shows an error message when resource update fails', async function () {
        const patchJson = JSON.stringify(fakeDiff)
        when(
            mockCloudControl.updateResource(
                deepEqual({
                    TypeName: fakeType,
                    Identifier: fakeIdentifier,
                    PatchDocument: patchJson,
                })
            )
        ).thenReject(new Error())
        const window = new FakeWindow()

        try {
            await updateResource(fakeType, fakeIdentifier, fakeDefinition, instance(mockCloudControl), window, fakeDiff)
        } catch (err) {
            assert.ok(window.message.error?.startsWith(`Failed to update resource ${fakeIdentifier} (${fakeType})`))
            return
        }
        assert.fail('Expected exception, but none was thrown.')
    })

    it('shows a warning message when there is no diff', async function () {
        const window = new FakeWindow()

        await updateResource(fakeType, fakeIdentifier, fakeDefinition, instance(mockCloudControl), window, [])

        verify(mockCloudControl.updateResource(anything())).never()
        assert.ok(window.message.warning?.startsWith(`Update cancelled`))
    })

    it('shows a warning if unsupported action', async function () {
        const patchJson = JSON.stringify(fakeDiff)
        const error = new Error('fake exception')
        error.name = 'UnsupportedActionException'
        when(
            mockCloudControl.updateResource(
                deepEqual({
                    TypeName: fakeType,
                    Identifier: fakeIdentifier,
                    PatchDocument: patchJson,
                })
            )
        ).thenReject(error)
        const window = new FakeWindow()
        await updateResource(fakeType, fakeIdentifier, fakeDefinition, instance(mockCloudControl), window, fakeDiff)
        assert.ok(window.message.warning?.startsWith(`${fakeType} does not currently support resource updating`))
    })
})
