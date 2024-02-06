/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { copyIdentifier } from '../../../dynamicResources/commands/copyIdentifier'
import { assertNoErrorMessages } from '../../shared/vscode/window'
import { FakeClipboard } from '../../shared/vscode/fakeEnv'

describe('copyIdentifierCommand', function () {
    beforeEach(function () {
        const fakeClipboard = new FakeClipboard()
        sinon.stub(vscode.env, 'clipboard').value(fakeClipboard)
    })

    it('copies identifier to clipboard and shows status bar confirmation', async function () {
        const fakeIdentifier = 'resource1'

        await copyIdentifier('fakeResourceType', fakeIdentifier)

        assert.strictEqual(await vscode.env.clipboard.readText(), fakeIdentifier)
        assertNoErrorMessages()
    })
})
