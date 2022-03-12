/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import * as vscode from 'vscode'
import * as assert from 'assert'
import { register } from '../../caws/uriHandlers'
import { UriHandler } from '../../shared/vscode/uriHandler'
import { VSCODE_EXTENSION_ID } from '../../shared/extensions'
import { ConnectedCawsClient } from '../../shared/clients/cawsClient'

type Stub<T extends (...args: any[]) => any> = sinon.SinonStub<Parameters<T>, ReturnType<T>>

function createCloneUri(target: string): vscode.Uri {
    return vscode.Uri.parse(`vscode://${VSCODE_EXTENSION_ID.awstoolkit}/clone?url=${encodeURIComponent(target)}`)
}

describe('Clone Handler', function () {
    let handler: UriHandler
    let commandStub: Stub<typeof vscode.commands.executeCommand>

    beforeEach(function () {
        handler = new UriHandler()
        register(
            handler,
            command =>
                async (...args) =>
                    command({} as ConnectedCawsClient, ...args)
        )
        commandStub = sinon.stub(vscode.commands, 'executeCommand')
    })

    afterEach(function () {
        sinon.restore()
    })

    it('registers for "/clone"', function () {
        assert.throws(() => handler.registerHandler('/clone', () => {}))
    })

    it('ignores requests without a url', async function () {
        await handler.handleUri(createCloneUri('').with({ query: '' }))
        assert.strictEqual(commandStub.called, false)
    })

    it('does a normal git clone if not a CAWS URL', async function () {
        // SKipping this since the global CAWS client was removed
        // So we'll need a good test double for this test
        this.skip()
        const target = 'https://github.com/antlr/grammars-v4.git'
        await handler.handleUri(createCloneUri(target))
        assert.ok(commandStub.calledWith('git.clone', target))
    })

    // TODO: test more flows once we have a better model
})
