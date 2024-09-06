/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { createResource, updateResource } from '../../../dynamicResources/commands/saveResource'
import { AddOperation } from 'fast-json-patch'
import { CloudControlClient } from '../../../shared/clients/cloudControlClient'
import { getTestWindow } from '../../shared/vscode/window'
import sinon from 'sinon'

describe('createResource', function () {
    const fakeType = 'fakeType'
    const fakeDefinition = '{}'

    let mockCloudControl: CloudControlClient

    beforeEach(function () {
        mockCloudControl = {} as any as CloudControlClient
    })

    it('creates resources, shows progress and confirmation', async function () {
        const newIdentifier = 'newIdentifier'
        const createStub = sinon.stub().resolves({
            ProgressEvent: {
                Identifier: newIdentifier,
            },
        })
        mockCloudControl.createResource = createStub

        await createResource(fakeType, fakeDefinition, mockCloudControl)

        assert(
            createStub.calledOnceWithExactly({
                TypeName: fakeType,
                DesiredState: fakeDefinition,
            })
        )
        const progress = getTestWindow().getFirstMessage()
        assert.ok(!progress.cancellable)
        assert.deepStrictEqual(progress.progressReports, [{ message: `Creating resource (${fakeType})...` }])
        getTestWindow().getSecondMessage().assertInfo(`Created resource ${newIdentifier} (${fakeType})`)
    })

    it('shows an error message when resource creation fails', async function () {
        const createStub = sinon.stub().rejects()
        mockCloudControl.createResource = createStub

        try {
            await createResource(fakeType, fakeDefinition, mockCloudControl)
        } catch (err) {
            getTestWindow().getSecondMessage().assertError(`Failed to create resource (${fakeType})`)
            return
        }
        assert.fail('Expected exception, but none was thrown.')
    })

    it('shows an error message when definition is not valid json', async function () {
        const createStub = sinon.stub()
        mockCloudControl.createResource = createStub
        try {
            await createResource(fakeType, 'foo', mockCloudControl)
        } catch (err) {
            assert(createStub.notCalled)
            getTestWindow().getSecondMessage().assertError(`Failed to create resource (${fakeType})`)
            return
        }
        assert.fail('Expected exception, but none was thrown.')
    })

    it('shows a warning if unsupported action', async function () {
        const error = new Error('fake exception')
        error.name = 'UnsupportedActionException'
        const createStub = sinon.stub().rejects(error)
        mockCloudControl.createResource = createStub

        await createResource(fakeType, fakeDefinition, mockCloudControl)
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
        mockCloudControl = {} as any as CloudControlClient
    })

    it('updates resources, shows progress and confirmation', async function () {
        const patchJson = JSON.stringify(fakeDiff)
        const updateStub = sinon.stub()
        mockCloudControl.updateResource = updateStub
        const getStub = sinon.stub()
        mockCloudControl.getResource = getStub

        await updateResource(fakeType, fakeIdentifier, fakeDefinition, mockCloudControl, fakeDiff)

        assert(
            updateStub.calledOnceWithExactly({
                TypeName: fakeType,
                Identifier: fakeIdentifier,
                PatchDocument: patchJson,
            })
        )
        const progress = getTestWindow().getFirstMessage()
        assert.ok(!progress.cancellable)
        assert.deepStrictEqual(progress.progressReports, [
            { message: `Updating resource ${fakeIdentifier} (${fakeType})...` },
        ])
        getTestWindow().getSecondMessage().assertInfo(`Updated resource ${fakeIdentifier} (${fakeType})`)
    })

    it('shows an error message when resource update fails', async function () {
        const updateStub = sinon.stub().rejects()
        mockCloudControl.updateResource = updateStub

        try {
            await updateResource(fakeType, fakeIdentifier, fakeDefinition, mockCloudControl, fakeDiff)
        } catch (err) {
            getTestWindow().getSecondMessage().assertError(`Failed to update resource ${fakeIdentifier} (${fakeType})`)
            return
        }
        assert.fail('Expected exception, but none was thrown.')
    })

    it('shows a warning message when there is no diff', async function () {
        const updateStub = sinon.stub()
        mockCloudControl.updateResource = updateStub
        const getStub = sinon.stub()
        mockCloudControl.getResource = getStub
        await updateResource(fakeType, fakeIdentifier, fakeDefinition, mockCloudControl, [])

        assert(updateStub.notCalled)
        getTestWindow()
            .getSecondMessage()
            .assertWarn(/^Update cancelled/)
    })

    it('shows a warning if unsupported action', async function () {
        const error = new Error('fake exception')
        error.name = 'UnsupportedActionException'
        const updateStub = sinon.stub().rejects(error)
        mockCloudControl.updateResource = updateStub
        const getStub = sinon.stub()
        mockCloudControl.getResource = getStub
        await updateResource(fakeType, fakeIdentifier, fakeDefinition, mockCloudControl, fakeDiff)
        getTestWindow()
            .getSecondMessage()
            .assertWarn(new RegExp(`^${fakeType} does not currently support resource updating`))
    })
})
