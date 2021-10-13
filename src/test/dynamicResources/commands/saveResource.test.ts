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
    const FAKE_TYPE = 'fakeType'
    const FAKE_DEFINITION = '{}'

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
                    TypeName: FAKE_TYPE,
                    DesiredState: FAKE_DEFINITION,
                })
            )
        ).thenResolve({
            ProgressEvent: {
                Identifier: newIdentifier,
            },
        })

        await createResource(FAKE_TYPE, FAKE_DEFINITION, instance(mockCloudControl), window)

        verify(
            mockCloudControl.createResource(
                deepEqual({
                    TypeName: FAKE_TYPE,
                    DesiredState: FAKE_DEFINITION,
                })
            )
        ).once()
        assert.strictEqual(window.progress.options?.location, vscode.ProgressLocation.Notification)
        assert.strictEqual(window.progress.options?.cancellable, false)
        assert.deepStrictEqual(window.progress.reported, [{ message: `Creating resource (${FAKE_TYPE})...` }])

        assert.ok(window.message.information?.startsWith(`Created resource ${newIdentifier} (${FAKE_TYPE})`))
    })

    it('shows an error message when resource creation fails', async function () {
        when(
            mockCloudControl.createResource(
                deepEqual({
                    TypeName: FAKE_TYPE,
                    DesiredState: FAKE_DEFINITION,
                })
            )
        ).thenReject(new Error())
        const window = new FakeWindow()

        try {
            await createResource(FAKE_TYPE, FAKE_DEFINITION, instance(mockCloudControl), window)
        } catch (err) {
            assert.ok(window.message.error?.startsWith(`Failed to create resource (${FAKE_TYPE})`))
            return
        }
        assert.fail('Expected exception, but none was thrown.')
    })

    it('shows an error message when definition is not valid json', async function () {
        const window = new FakeWindow()
        try {
            await createResource(FAKE_TYPE, 'foo', instance(mockCloudControl), window)
        } catch (err) {
            verify(mockCloudControl.createResource(anything())).never()
            assert.ok(window.message.error?.startsWith(`Failed to create resource (${FAKE_TYPE})`))
            return
        }
        assert.fail('Expected exception, but none was thrown.')
    })
})

describe('updateResource', function () {
    const FAKE_TYPE = 'fakeType'
    const FAKE_IDENTIFIER = 'fakeIdentifier'
    const FAKE_DEFINITION = '{}'
    const FAKE_OPERATION = { op: 'add', value: 'Foo' } as AddOperation<string>
    const FAKE_DIFF = [FAKE_OPERATION]

    let mockCloudControl: CloudControlClient

    beforeEach(function () {
        mockCloudControl = mock()
    })

    it('updates resources, shows progress and confirmation', async function () {
        const window = new FakeWindow()
        const patchJson = JSON.stringify(FAKE_DIFF)

        when(
            mockCloudControl.updateResource(
                deepEqual({
                    TypeName: FAKE_TYPE,
                    Identifier: FAKE_IDENTIFIER,
                    PatchDocument: patchJson,
                })
            )
        ).thenResolve()

        await updateResource(FAKE_TYPE, FAKE_IDENTIFIER, FAKE_DEFINITION, instance(mockCloudControl), window, FAKE_DIFF)

        verify(
            mockCloudControl.updateResource(
                deepEqual({
                    TypeName: FAKE_TYPE,
                    Identifier: FAKE_IDENTIFIER,
                    PatchDocument: patchJson,
                })
            )
        ).once()
        assert.strictEqual(window.progress.options?.location, vscode.ProgressLocation.Notification)
        assert.strictEqual(window.progress.options?.cancellable, false)
        assert.deepStrictEqual(window.progress.reported, [
            { message: `Updating resource ${FAKE_IDENTIFIER} (${FAKE_TYPE})...` },
        ])

        assert.ok(window.message.information?.startsWith(`Updated resource ${FAKE_IDENTIFIER} (${FAKE_TYPE})`))
    })

    it('shows an error message when resource update fails', async function () {
        const patchJson = JSON.stringify(FAKE_DIFF)
        when(
            mockCloudControl.updateResource(
                deepEqual({
                    TypeName: FAKE_TYPE,
                    Identifier: FAKE_IDENTIFIER,
                    PatchDocument: patchJson,
                })
            )
        ).thenReject(new Error())
        const window = new FakeWindow()

        try {
            await updateResource(
                FAKE_TYPE,
                FAKE_IDENTIFIER,
                FAKE_DEFINITION,
                instance(mockCloudControl),
                window,
                FAKE_DIFF
            )
        } catch (err) {
            assert.ok(window.message.error?.startsWith(`Failed to update resource ${FAKE_IDENTIFIER} (${FAKE_TYPE})`))
            return
        }
        assert.fail('Expected exception, but none was thrown.')
    })

    it('shows a warning message when there is no diff', async function () {
        const window = new FakeWindow()

        await updateResource(FAKE_TYPE, FAKE_IDENTIFIER, FAKE_DEFINITION, instance(mockCloudControl), window, [])

        verify(mockCloudControl.updateResource(anything())).never()
        assert.ok(window.message.warning?.startsWith(`Update cancelled`))
    })
})
