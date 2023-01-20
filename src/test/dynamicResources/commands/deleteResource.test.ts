/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as sinon from 'sinon'
import * as assert from 'assert'
import { FakeWindow } from '../../shared/vscode/fakeWindow'
import { deleteResource } from '../../../dynamicResources/commands/deleteResource'
import { DefaultCloudControlClient } from '../../../shared/clients/cloudControlClient'

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
        const window = new FakeWindow({ message: { warningSelection: 'Delete' } })
        const stub = sandbox
            .stub(cloudControl, 'deleteResource')
            .callsFake(async ({ TypeName: typeName, Identifier: identifier }) => {
                assert.strictEqual(typeName, fakeType)
                assert.strictEqual(identifier, fakeIdentifier)
            })

        await deleteResource(cloudControl, fakeType, fakeIdentifier, window)

        assert.strictEqual(window.message.warning, `Delete resource ${fakeIdentifier} (${fakeType})?`)

        assert.strictEqual(stub.calledOnce, true)

        assert.strictEqual(window.progress.options?.location, vscode.ProgressLocation.Notification)
        assert.strictEqual(window.progress.options?.cancellable, false)
        assert.deepStrictEqual(window.progress.reported, [
            { message: `Deleting resource ${fakeIdentifier} (${fakeType})...` },
        ])

        assert.ok(window.message.information?.startsWith(`Deleted resource ${fakeIdentifier} (${fakeType})`))
    })

    it('does nothing when deletion is cancelled', async function () {
        const window = new FakeWindow({ message: { warningSelection: 'Cancel' } })
        const spy = sandbox.spy(cloudControl, 'deleteResource')

        await deleteResource(cloudControl, fakeType, fakeIdentifier, window)

        assert.strictEqual(spy.notCalled, true)

        assert.strictEqual(window.statusBar.message, undefined)
        assert.strictEqual(window.message.error, undefined)
    })

    it('shows an error message when resource deletion fails', async function () {
        sandbox.stub(cloudControl, 'deleteResource').callsFake(async () => {
            throw new Error('fake exception')
        })

        const window = new FakeWindow({ message: { warningSelection: 'Delete' } })

        await deleteResource(cloudControl, fakeType, fakeIdentifier, window)

        assert.ok(window.message.error?.startsWith(`Failed to delete resource ${fakeIdentifier} (${fakeType})`))
    })

    it('shows a warning if unsupported action', async function () {
        sandbox.stub(cloudControl, 'deleteResource').callsFake(async () => {
            const error = new Error('fake exception')
            error.name = 'UnsupportedActionException'
            throw error
        })

        const window = new FakeWindow({ message: { warningSelection: 'Delete' } })

        await deleteResource(cloudControl, fakeType, fakeIdentifier, window)

        assert.ok(window.message.warning?.startsWith(`Resource type ${fakeType} does not currently support delete`))
    })
})
