/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import * as vscode from 'vscode'
import assert from 'assert'
import { register } from '../../codecatalyst/uriHandlers'
import { UriHandler } from '../../shared/vscode/uriHandler'
import { VSCODE_EXTENSION_ID } from '../../shared/extensions'
import { CodeCatalystClient } from '../../shared/clients/codecatalystClient'
import { SeverityLevel } from '../shared/vscode/message'
import { getTestWindow } from '../shared/vscode/window'
import { builderIdStartUrl } from '../../auth/sso/model'
import { defaultSsoRegion } from '../../auth/connection'

type Stub<T extends (...args: any[]) => any> = sinon.SinonStub<Parameters<T>, ReturnType<T>>

function createCloneUri(target: string): vscode.Uri {
    return vscode.Uri.parse(`vscode://${VSCODE_EXTENSION_ID.awstoolkit}/clone?url=${encodeURIComponent(target)}`)
}

function createConnectUri(params: { [key: string]: any }): vscode.Uri {
    const encoded = Object.entries(params)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&')
    return vscode.Uri.parse(`vscode://${VSCODE_EXTENSION_ID.awstoolkit}/connect/codecatalyst?${encoded}`)
}

// Tests involving `UriHandler` should _not_ couple the URI paths to the implementation.
// The path is apart of our public API! They should not be easy to change.

describe('CodeCatalyst handlers', function () {
    let commandStub: Stub<typeof vscode.commands.executeCommand>
    const client = {} as any as CodeCatalystClient

    beforeEach(function () {
        commandStub = sinon.stub(vscode.commands, 'executeCommand')
    })

    afterEach(function () {
        sinon.restore()
    })

    describe('clone', function () {
        let handler: UriHandler

        beforeEach(function () {
            handler = new UriHandler()
            register(handler, {
                cloneRepo: {
                    execute: async () => undefined,
                } as any,
            } as any)
        })

        it('registers for "/clone"', function () {
            assert.throws(() => handler.onPath('/clone', () => {}))
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

        const params = {
            devEnvironmentId: devenvId.id,
            spaceName: devenvId.org.name,
            projectName: devenvId.project.name,
        }

        let openDevEnvMock: sinon.SinonExpectation
        let handler: UriHandler

        beforeEach(function () {
            handler = new UriHandler()
            openDevEnvMock = sinon.mock()
            register(handler, {
                openDevEnv: {
                    execute: openDevEnvMock,
                } as any,
            } as any)
        })

        it('returns builder ID SSO if IdC params are not present', async function () {
            await handler.handleUri(createConnectUri(params))
            assert.ok(
                openDevEnvMock.calledWith(sinon.match.any, devenvId, undefined, {
                    startUrl: builderIdStartUrl,
                    region: defaultSsoRegion,
                })
            )
        })

        it('returns provided IdC params', async function () {
            const ssoStartUrl = 'https://my-url'
            const ssoRegion = 'us-west-2'
            await handler.handleUri(createConnectUri({ ...params, sso_start_url: ssoStartUrl, sso_region: ssoRegion }))
            assert.ok(
                openDevEnvMock.calledWith(sinon.match.any, devenvId, undefined, {
                    startUrl: ssoStartUrl,
                    region: ssoRegion,
                })
            )
        })

        it('checks that the environment exists', async function () {
            // This test is not accurate anymore because dependencies are checked prior to API calls
            // Unit tests are ran without other extensions activated, so this fails on the SSH extension check
            this.skip()

            const getDevEnvStub = sinon.stub().rejects(new Error('No dev environment found'))
            client.getDevEnvironment = getDevEnvStub
            const errorMessage = getTestWindow()
                .waitForMessage(/Failed to handle/)
                .then(message => {
                    message.assertSeverity(SeverityLevel.Error)
                })

            await handler.handleUri(createConnectUri(devenvId))
            await errorMessage
        })
    })
})
