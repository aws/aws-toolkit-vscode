/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { instance, mock, when, verify, anything, deepEqual } from 'ts-mockito'
import { createResource, updateResource } from '../../../dynamicResources/commands/saveResource'
import { AddOperation } from 'fast-json-patch'
import { CloudControlClient } from '../../../shared/clients/cloudControlClient'
import { getTestWindow } from '../../shared/vscode/window'

describe('createResource', function () {
    const fakeType = 'fakeType'
    const fakeDefinition = '{}'

    let mockCloudControl: CloudControlClient

    beforeEach(function () {
        mockCloudControl = mock()
    })

    it('creates resources, shows progress and confirmation', async function () {
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

        await createResource(fakeType, fakeDefinition, instance(mockCloudControl))

        verify(
            mockCloudControl.createResource(
                deepEqual({
                    TypeName: fakeType,
                    DesiredState: fakeDefinition,
                })
            )
        ).once()
        const progress = getTestWindow().getFirstMessage()
        assert.ok(!progress.cancellable)
        assert.deepStrictEqual(progress.progressReports, [{ message: `Creating resource (${fakeType})...` }])
        getTestWindow().getSecondMessage().assertInfo(`Created resource ${newIdentifier} (${fakeType})`)
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

        try {
            await createResource(fakeType, fakeDefinition, instance(mockCloudControl))
        } catch (err) {
            getTestWindow().getSecondMessage().assertError(`Failed to create resource (${fakeType})`)
            return
        }
        assert.fail('Expected exception, but none was thrown.')
    })

    it('shows an error message when definition is not valid json', async function () {
        try {
            await createResource(fakeType, 'foo', instance(mockCloudControl))
        } catch (err) {
            verify(mockCloudControl.createResource(anything())).never()
            getTestWindow().getSecondMessage().assertError(`Failed to create resource (${fakeType})`)
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

        await createResource(fakeType, fakeDefinition, instance(mockCloudControl))
        getTestWindow()
            .getSecondMessage()
            .assertWarn(new RegExp(`^${fakeType} does not currently support resource creation`))
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

        await updateResource(fakeType, fakeIdentifier, fakeDefinition, instance(mockCloudControl), fakeDiff)

        verify(
            mockCloudControl.updateResource(
                deepEqual({
                    TypeName: fakeType,
                    Identifier: fakeIdentifier,
                    PatchDocument: patchJson,
                })
            )
        ).once()
        const progress = getTestWindow().getFirstMessage()
        assert.ok(!progress.cancellable)
        assert.deepStrictEqual(progress.progressReports, [
            { message: `Updating resource ${fakeIdentifier} (${fakeType})...` },
        ])
        getTestWindow().getSecondMessage().assertInfo(`Updated resource ${fakeIdentifier} (${fakeType})`)
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

        try {
            await updateResource(fakeType, fakeIdentifier, fakeDefinition, instance(mockCloudControl), fakeDiff)
        } catch (err) {
            getTestWindow().getSecondMessage().assertError(`Failed to update resource ${fakeIdentifier} (${fakeType})`)
            return
        }
        assert.fail('Expected exception, but none was thrown.')
    })

    it('shows a warning message when there is no diff', async function () {
        await updateResource(fakeType, fakeIdentifier, fakeDefinition, instance(mockCloudControl), [])

        verify(mockCloudControl.updateResource(anything())).never()
        getTestWindow()
            .getSecondMessage()
            .assertWarn(/^Update cancelled/)
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
        await updateResource(fakeType, fakeIdentifier, fakeDefinition, instance(mockCloudControl), fakeDiff)
        getTestWindow()
            .getSecondMessage()
            .assertWarn(new RegExp(`^${fakeType} does not currently support resource updating`))
    })
})
