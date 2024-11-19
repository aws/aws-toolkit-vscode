/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0 fort
 */

import { RemoteFetcher } from '../../notifications/controller'
import { NotificationsNode } from '../../notifications/panelNode'
import { activate, deactivate } from '../../notifications/activation'
import globals from '../../shared/extensionGlobals'
import assert from 'assert'
import sinon from 'sinon'
import { createTestAuth } from '../../test/credentials/testUtil'
import { AuthUtil } from '../../codewhisperer/util/authUtil'
import { Auth } from '../../auth/auth'
import { ShownMessage } from '../../test/shared/vscode/message'
import { getTestWindow } from '../../test/shared/vscode/window'
import { AuthUserState } from '../../shared/telemetry/telemetry.gen'
import { globalKey } from '../../shared/globalState'
import { waitUntil } from '../../shared/utilities/timeoutUtils'
import { assertTelemetry, assertTextEditorContains } from '../../test/testUtil'

/**
 * Return an extension-specific suite that will take parameters from that running extension and
 * perform a thorough integ test.
 *
 * IMPORTANT:
 * These tests are dependent on what is hosted on the server (message contents, criteria, etc).
 */
export function getNotificationsSuite(getAuthStateFn: () => Promise<Omit<AuthUserState, 'source'>>) {
    return describe('Notifications Integration Test', function () {
        const storageKey = 'aws.notifications.test' as globalKey
        const fetcher = new RemoteFetcher(
            'https://idetoolkits-hostedfiles.amazonaws.com/Notifications/integ/VSCode/startup/1.x.json',
            'https://idetoolkits-hostedfiles.amazonaws.com/Notifications/integ/VSCode/emergency/1.x.json'
        )
        // const panelNode = NotificationsNode.instance
        const sandbox = sinon.createSandbox()
        let auth: ReturnType<typeof createTestAuth>
        let authUtil: AuthUtil

        beforeEach(async function () {
            await globals.globalState.update(storageKey, undefined)
            auth = createTestAuth(globals.globalState)
            authUtil = new AuthUtil(auth)
            sandbox.stub(Auth, 'instance').value(auth)
            sandbox.stub(AuthUtil, 'instance').value(authUtil)
        })

        afterEach(async function () {
            await globals.globalState.update(storageKey, undefined)
            sandbox.restore()
        })

        /**
         * A way to track notifications displayed in the IDE.
         * See {@link setupTestWindow} for usage.
         */
        function msgHandler(text: string, fn: (m: ShownMessage) => Promise<void>) {
            return {
                seen: false, // have we seen and processed this message
                text, // title of the notification to match the message on
                fn, // what to do with the message
            }
        }

        function setupTestWindow(toHandle: ReturnType<typeof msgHandler>[]) {
            const testWindow = getTestWindow()
            testWindow.onDidShowMessage(async (message) => {
                const handler = toHandle.find((h) => message.message.includes(h.text))
                if (handler) {
                    await handler.fn(message)
                    handler.seen = true
                }
            })

            return testWindow
        }

        /**
         * Set up the test window, activate the notifications module, and wait for
         * messages to resolve in the UI.
         */
        async function runTest(toHandle: ReturnType<typeof msgHandler>[]) {
            setupTestWindow(toHandle)

            const initialState = await getAuthStateFn()
            await activate(globals.context, initialState, getAuthStateFn, {
                fetcher,
                storageKey,
            })

            await waitUntil(async () => toHandle.every((h) => h.seen), { timeout: 12000 })
        }

        it('can fetch unauthenticated notifications', async function () {
            await runTest([
                msgHandler('New Amazon Q features are available!', async (m: ShownMessage) => {
                    assert.ok(!m.modal)
                    assert.ok(m.items.find((i) => i.title.includes('Learn more')))
                    m.close()
                }),
                msgHandler(
                    'Signing into Amazon Q is broken, please try this workaround while we work on releasing a fix.',
                    async (m: ShownMessage) => {
                        assert.ok(!m.modal)
                        m.selectItem('Learn more')
                        await assertTextEditorContains(
                            'There is currently a bug that is preventing users from signing into Amazon Q.',
                            false
                        )
                    }
                ),
            ])

            assert.equal(NotificationsNode.instance.getChildren().length, 2)
            assertTelemetry('toolkit_showNotification', [
                { id: 'TARGETED_NOTIFICATION:startup2' },
                { id: 'TARGETED_NOTIFICATION:emergency1' },
            ])
            assertTelemetry('toolkit_invokeAction', [
                { action: 'OK', source: 'TARGETED_NOTIFICATION:startup2' },
                { action: 'Learn more', source: 'TARGETED_NOTIFICATION:emergency1' },
            ])

            deactivate()
        })

        it('can fetch authenticated notifications', async function () {
            await auth.useConnection(await authUtil.connectToAwsBuilderId())
            await runTest([
                msgHandler('New Amazon Q features available: inline chat', async (m: ShownMessage) => {
                    assert.ok(!m.modal)
                    m.selectItem('Learn more')
                    await assertTextEditorContains(
                        'You can now use Amazon Q inline in your IDE, without ever touching the mouse or using copy and paste.',
                        false
                    )
                }),
                msgHandler('Amazon Q may delete user data', async (m: ShownMessage) => {
                    assert.ok(m.modal)
                    assert.ok(m.items.find((i) => i.title.includes('Update and Reload')))
                    m.close()
                }),
            ])

            assert.equal(NotificationsNode.instance.getChildren().length, 3) // includes one startup notification that wasn't checked here. (checked in another test)
            assertTelemetry('toolkit_showNotification', [
                { id: 'TARGETED_NOTIFICATION:startup1' },
                { id: 'TARGETED_NOTIFICATION:startup2' },
                { id: 'TARGETED_NOTIFICATION:emergency2' },
            ])
            assertTelemetry('toolkit_invokeAction', [
                { action: 'Learn more', source: 'TARGETED_NOTIFICATION:startup1' },
                { action: 'OK', source: 'TARGETED_NOTIFICATION:emergency2' },
            ])

            deactivate()
        })
    })
}
