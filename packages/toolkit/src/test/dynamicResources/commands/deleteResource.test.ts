/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import assert from 'assert'
import { deleteResource } from '../../../dynamicResources/commands/deleteResource'
import { DefaultCloudControlClient } from '../../../shared/clients/cloudControlClient'
import { assertNoErrorMessages, getTestWindow } from '../../shared/vscode/window'

describe('deleteResource', function () {
    const fakeType = 'fakeType'
    const fakeIdentifier = 'fakeIdentifier'
    const cloudControl = new DefaultCloudControlClient('')
    let sandbox: sinon.SinonSandbox

    beforeEach(function () {
        sandbox = sinon.createSandbox()
    })

    afterEach(function () {
        sandbox.restore()
    })

    it('confirms deletion, deletes resources, shows progress and confirmation', async function () {
        getTestWindow().onDidShowMessage(m => m.items.find(i => i.title === 'Delete')?.select())
        const stub = sandbox
            .stub(cloudControl, 'deleteResource')
            .callsFake(async ({ TypeName: typeName, Identifier: identifier }) => {
                assert.strictEqual(typeName, fakeType)
                assert.strictEqual(identifier, fakeIdentifier)
            })

        await deleteResource(cloudControl, fakeType, fakeIdentifier)

        getTestWindow().getFirstMessage().assertWarn(`Delete resource ${fakeIdentifier} (${fakeType})?`)

        assert.strictEqual(stub.calledOnce, true)

        const progressNotification = getTestWindow().getSecondMessage()
        assert.strictEqual(progressNotification.items.length, 0)
        assert.deepStrictEqual(progressNotification.progressReports, [
            { message: `Deleting resource ${fakeIdentifier} (${fakeType})...` },
        ])

        getTestWindow().getThirdMessage().assertInfo(`Deleted resource ${fakeIdentifier} (${fakeType})`)
    })

    it('does nothing when deletion is cancelled', async function () {
        getTestWindow().onDidShowMessage(m => m.selectItem('Cancel'))
        const spy = sandbox.spy(cloudControl, 'deleteResource')

        await deleteResource(cloudControl, fakeType, fakeIdentifier)

        assertNoErrorMessages()
        assert.strictEqual(spy.notCalled, true)
        assert.deepStrictEqual(getTestWindow().statusBar.messages, [])
    })

    it('shows an error message when resource deletion fails', async function () {
        sandbox.stub(cloudControl, 'deleteResource').callsFake(async () => {
            throw new Error('fake exception')
        })

        getTestWindow().onDidShowMessage(m => m.items.find(i => i.title === 'Delete')?.select())

        await deleteResource(cloudControl, fakeType, fakeIdentifier)
        getTestWindow().getThirdMessage().assertError(`Failed to delete resource ${fakeIdentifier} (${fakeType})`)
    })

    it('shows a warning if unsupported action', async function () {
        sandbox.stub(cloudControl, 'deleteResource').callsFake(async () => {
            const error = new Error('fake exception')
            error.name = 'UnsupportedActionException'
            throw error
        })
        getTestWindow().onDidShowMessage(m => m.items.find(i => i.title === 'Delete')?.select())

        await deleteResource(cloudControl, fakeType, fakeIdentifier)
        getTestWindow()
            .getThirdMessage()
            .assertWarn(new RegExp(`Resource type ${fakeType} does not currently support delete`))
    })
})
