/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as sinon from 'sinon'
import * as assert from 'assert'
import { FakeWindow } from '../../shared/vscode/fakeWindow'
import { MockCloudControlClient } from '../../shared/clients/mockClients'
import { deleteResource } from '../../../dynamicResources/commands/deleteResource'
import { CloudControlClient } from '../../../shared/clients/cloudControlClient'

describe('deleteResource', function () {
    const FAKE_TYPE = 'fakeType'
    const FAKE_IDENTIFIER = 'fakeIdentifier'
    const cloudControl: CloudControlClient = new MockCloudControlClient()
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
                assert.strictEqual(typeName, FAKE_TYPE)
                assert.strictEqual(identifier, FAKE_IDENTIFIER)
            })

        await deleteResource(cloudControl, FAKE_TYPE, FAKE_IDENTIFIER, window)

        assert.strictEqual(window.message.warning, `Delete resource ${FAKE_IDENTIFIER} (${FAKE_TYPE})?`)

        assert.strictEqual(stub.calledOnce, true)

        assert.strictEqual(window.progress.options?.location, vscode.ProgressLocation.Notification)
        assert.strictEqual(window.progress.options?.cancellable, false)
        assert.deepStrictEqual(window.progress.reported, [
            { message: `Deleting resource ${FAKE_IDENTIFIER} (${FAKE_TYPE})...` },
        ])

        assert.ok(window.message.information?.startsWith(`Deleted resource ${FAKE_IDENTIFIER} (${FAKE_TYPE})`))
    })

    it('does nothing when deletion is cancelled', async function () {
        const window = new FakeWindow({ message: { warningSelection: 'Cancel' } })
        const spy = sandbox.spy(cloudControl, 'deleteResource')

        await deleteResource(cloudControl, FAKE_TYPE, FAKE_IDENTIFIER, window)

        assert.strictEqual(spy.notCalled, true)

        assert.strictEqual(window.statusBar.message, undefined)
        assert.strictEqual(window.message.error, undefined)
    })

    it('shows an error message when resource deletion fails', async function () {
        sandbox.stub(cloudControl, 'deleteResource').callsFake(async () => {
            throw new Error('fake exception')
        })

        const window = new FakeWindow({ message: { warningSelection: 'Delete' } })

        await deleteResource(cloudControl, FAKE_TYPE, FAKE_IDENTIFIER, window)

        assert.ok(window.message.error?.startsWith(`Failed to delete resource ${FAKE_IDENTIFIER} (${FAKE_TYPE})`))
    })
})
