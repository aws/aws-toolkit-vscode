/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import * as vscode from 'vscode'
import * as assert from 'assert'
import { register } from '../../codecatalyst/uriHandlers'
import { UriHandler } from '../../shared/vscode/uriHandler'
import { VSCODE_EXTENSION_ID } from '../../shared/extensions'
import { CodeCatalystClient } from '../../shared/clients/codecatalystClient'
import { anything, mock, reset, when } from 'ts-mockito'
import { SeverityLevel } from '../shared/vscode/message'
import { DevEnvironmentId } from '../../codecatalyst/model'
import { getTestWindow } from '../shared/vscode/window'

type Stub<T extends (...args: any[]) => any> = sinon.SinonStub<Parameters<T>, ReturnType<T>>

function createCloneUri(target: string): vscode.Uri {
    return vscode.Uri.parse(`vscode://${VSCODE_EXTENSION_ID.awstoolkit}/clone?url=${encodeURIComponent(target)}`)
}

function createConnectUri(env: DevEnvironmentId): vscode.Uri {
    const params = {
        devEnvironmentId: env.id,
        spaceName: env.org.name,
        projectName: env.project.name,
    }
    const encoded = Object.entries(params)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&')
    return vscode.Uri.parse(`vscode://${VSCODE_EXTENSION_ID.awstoolkit}/connect/codecatalyst?${encoded}`)
}

// Tests involving `UriHandler` should _not_ couple the URI paths to the implementation.
// The path is apart of our public API! They should not be easy to change.

describe('CodeCatalyst handlers', function () {
    let handler: UriHandler
    let commandStub: Stub<typeof vscode.commands.executeCommand>
    const client = mock<CodeCatalystClient>()

    beforeEach(function () {
        handler = new UriHandler()
        register(handler, {
            openDevEnv: {
                execute: async () => undefined,
            } as any,
            cloneRepo: {
                execute: async () => undefined,
            } as any,
        })
        commandStub = sinon.stub(vscode.commands, 'executeCommand')
    })

    afterEach(function () {
        sinon.restore()
        reset(client)
    })

    describe('clone', function () {
        it('registers for "/clone"', function () {
            assert.throws(() => handler.registerHandler('/clone', () => {}))
        })

        it('ignores requests without a url', async function () {
            await handler.handleUri(createCloneUri('').with({ query: '' }))
            assert.strictEqual(commandStub.called, false)
        })

        it('does a normal git clone if not a CodeCatalyst URL', async function () {
            const target = 'https://github.com/antlr/grammars-v4.git'
            await handler.handleUri(createCloneUri(target))
            assert.ok(commandStub.calledWith('git.clone', target))
        })
    })

    describe('connect', function () {
        const devenvId = {
            id: 'somefoo',
            org: { name: 'org' },
            project: { name: 'project' },
        }

        it('checks that the environment exists', async function () {
            // This test is not accurate anymore because dependencies are checked prior to API calls
            // Unit tests are ran without other extensions activated, so this fails on the SSH extension check
            this.skip()

            const errorMessage = getTestWindow()
                .waitForMessage(/Failed to handle/)
                .then(message => {
                    message.assertSeverity(SeverityLevel.Error)
                })

            when(client.getDevEnvironment(anything())).thenReject(new Error('No development environment found'))
            await handler.handleUri(createConnectUri(devenvId))
            await errorMessage
        })
    })
})
