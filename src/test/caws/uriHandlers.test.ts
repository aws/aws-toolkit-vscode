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
import { CawsDevEnv, ConnectedCawsClient } from '../../shared/clients/cawsClient'
import { anything, instance, mock, reset, verify, when } from 'ts-mockito'
import { createTestWindow, TestWindow } from '../shared/vscode/window'
import { SeverityLevel } from '../shared/vscode/message'

type Stub<T extends (...args: any[]) => any> = sinon.SinonStub<Parameters<T>, ReturnType<T>>

function createCloneUri(target: string): vscode.Uri {
    return vscode.Uri.parse(`vscode://${VSCODE_EXTENSION_ID.awstoolkit}/clone?url=${encodeURIComponent(target)}`)
}

function createConnectUri(env: Pick<CawsDevEnv, 'developmentWorkspaceId' | 'org' | 'project'>): vscode.Uri {
    const params = {
        developmentWorkspaceId: env.developmentWorkspaceId,
        organizationName: env.org.name,
        projectName: env.project.name,
    }
    const encoded = Object.entries(params)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&')
    return vscode.Uri.parse(`vscode://${VSCODE_EXTENSION_ID.awstoolkit}/connect/caws?${encoded}`)
}

// Tests involving `UriHandler` should _not_ couple the URI paths to the implementation.
// The path is apart of our public API! They should not be easy to change.

describe('CAWS handlers', function () {
    let handler: UriHandler
    let testWindow: TestWindow
    let commandStub: Stub<typeof vscode.commands.executeCommand>
    const client = mock<ConnectedCawsClient>()

    beforeEach(function () {
        handler = new UriHandler((testWindow = createTestWindow()))
        register(
            handler,
            command =>
                async (...args) =>
                    command(instance(client), ...args)
        )
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

        it('does a normal git clone if not a CAWS URL', async function () {
            const target = 'https://github.com/antlr/grammars-v4.git'
            await handler.handleUri(createCloneUri(target))
            assert.ok(commandStub.calledWith('git.clone', target))
        })
    })

    describe('connect', function () {
        const env = {
            developmentWorkspaceId: 'somefoo',
            org: { name: 'org' },
            project: { name: 'project' },
        }

        it('checks that the environment exists', async function () {
            const errorMessage = testWindow.waitForMessage(/Failed to handle/).then(message => {
                message.assertSeverity(SeverityLevel.Error)
            })

            when(client.getDevEnv(anything())).thenResolve(undefined)
            await handler.handleUri(createConnectUri(env))
            await errorMessage
        })

        it('tries to connect to the environment', async function () {
            const fullEnv = {
                ...env,
                type: 'env' as const,
                id: env.developmentWorkspaceId,
                creatorId: '',
                ide: '',
                lastUpdatedTime: new Date(),
                name: 'somefoo',
                repositories: [],
                status: '',
            }

            when(client.getDevEnv(anything())).thenResolve(fullEnv)
            when(client.startEnvironmentWithProgress(anything(), 'RUNNING')).thenResolve(undefined)

            await handler.handleUri(createConnectUri(env))
            verify(client.startEnvironmentWithProgress(anything(), 'RUNNING')).once()
        })
    })
})
