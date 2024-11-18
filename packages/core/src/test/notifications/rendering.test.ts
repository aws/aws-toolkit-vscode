/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as sinon from 'sinon'
import * as FakeTimers from '@sinonjs/fake-timers'
import assert from 'assert'
import { ToolkitNotification } from '../../notifications/types'
import { panelNode } from './controller.test'
import { getTestWindow } from '../shared/vscode/window'
import * as VsCodeUtils from '../../shared/utilities/vsCodeUtils'
import { assertTextEditorContains, installFakeClock } from '../testUtil'
import { waitUntil } from '../../shared/utilities/timeoutUtils'
import globals from '../../shared/extensionGlobals'

describe('Notifications Rendering', function () {
    let sandbox: sinon.SinonSandbox

    beforeEach(function () {
        sandbox = sinon.createSandbox()
    })

    afterEach(function () {
        sandbox.restore()
    })

    // util to test txt pop-up under different senarios
    async function verifyTxtNotification(notification: ToolkitNotification) {
        const expectedContent = notification.uiRenderInstructions.content['en-US'].description
        void panelNode.openNotification(notification)

        await assertTextEditorContains(expectedContent)
    }

    // util to test open url under different senarios
    async function verifyOpenExternalUrl(notification: ToolkitNotification) {
        const openUrlStub = sandbox.stub(VsCodeUtils, 'openUrl')
        await panelNode.openNotification(notification)

        assert.ok(openUrlStub.calledWith(vscode.Uri.parse('https://aws.amazon.com/visualstudiocode/')))
    }

    // test on-receive behaviors
    it('displays a toast with correct message on receive', async function () {
        const testWindow = getTestWindow()
        testWindow.onDidShowMessage((message) => {})

        const notification = getToastURLTestNotification()
        await panelNode.onReceiveNotifications([notification])

        const expectedMessage =
            notification.uiRenderInstructions.content['en-US'].toastPreview ??
            notification.uiRenderInstructions.content['en-US'].title

        const shownMessages = testWindow.shownMessages
        assert.ok(shownMessages.some((msg) => msg.message === expectedMessage))
    })

    it('displays a modal with correct buttons on receive', async function () {
        const testWindow = getTestWindow()
        const notification = getModalNotification()

        testWindow.onDidShowMessage((message) => {
            const expectedButtons =
                notification.uiRenderInstructions.actions?.map((actions) => actions.displayText['en-US']) ?? []
            expectedButtons.forEach((buttonText) => {
                assert.ok(
                    message.items.some((item) => item.title === buttonText),
                    `Button "${buttonText}" is missing`
                )
            })
        })

        await panelNode.onReceiveNotifications([notification])
    })

    // test on-lick behaviors
    it('open a txt with correct content on-click', async function () {
        const notification = getTxtNotification()
        await verifyTxtNotification(notification)
    })

    it('opens a URL with correct link on-click', async function () {
        const notification = getToastURLTestNotification()
        await verifyOpenExternalUrl(notification)
    })

    // test modal buttons behavior
    it('executes updateAndReload type button', async function () {
        const testWindow = getTestWindow()
        testWindow.onDidShowMessage((message) => {
            // Simulate user clicking update and reload type
            message.selectItem('Update and Reload')
        })
        const excuteCommandStub = sandbox.stub(vscode.commands, 'executeCommand').resolves()
        const telemetrySpy = sandbox.spy(globals.telemetry, 'flushRecords')
        const notification = getModalNotification()

        // Update and Reload is put on a timer so that other methods (e.g. telemetry) can finish.
        const clock: FakeTimers.InstalledClock = installFakeClock()
        await panelNode.openNotification(notification)

        await clock.tickAsync(1000)
        clock.uninstall()

        await waitUntil(async () => excuteCommandStub.called, { interval: 5, timeout: 5000 })

        assert.ok(excuteCommandStub.calledWith('workbench.extensions.installExtension', 'aws.toolkit.fake.extension'))
        assert.ok(excuteCommandStub.calledWith('workbench.action.reloadWindow'))
        assert.ok(telemetrySpy.calledOnce)
    })

    it('executes openUrl type button', async function () {
        const testWindow = getTestWindow()
        testWindow.onDidShowMessage((message) => {
            // Simulate user clicking open URL type
            message.selectItem('Proceed to Wiki')
        })
        const notification = getModalNotification()
        await verifyOpenExternalUrl(notification)
    })

    it('executes openTextDocument type button', async function () {
        const testWindow = getTestWindow()
        testWindow.onDidShowMessage((message) => {
            // Simulate user clicking open txt type
            message.selectItem('Read More')
        })
        const notification = getModalNotification()
        await verifyTxtNotification(notification)
    })
})

// generate test notifications
function getToastURLTestNotification(): ToolkitNotification {
    return {
        id: 'test notification 1',
        displayIf: {
            extensionId: 'aws.toolkit.fake.extension',
        },
        uiRenderInstructions: {
            content: {
                [`en-US`]: {
                    title: 'test',
                    description: 'This is a url notification.',
                    toastPreview: 'test toast preview',
                },
            },
            onReceive: 'toast',
            onClick: {
                type: 'openUrl',
                url: 'https://aws.amazon.com/visualstudiocode/',
            },
        },
    }
}

function getTxtNotification(): ToolkitNotification {
    return {
        id: 'test notification 2',
        displayIf: {
            extensionId: 'aws.toolkit.fake.extension',
        },
        uiRenderInstructions: {
            content: {
                [`en-US`]: {
                    title: 'test',
                    description: 'This is a text document notification.',
                },
            },
            onReceive: 'toast',
            onClick: {
                type: 'openTextDocument',
            },
        },
    }
}

function getModalNotification(): ToolkitNotification {
    return {
        id: 'test notification 3',
        displayIf: {
            extensionId: 'aws.toolkit.fake.extension',
        },
        uiRenderInstructions: {
            content: {
                [`en-US`]: {
                    title: 'test',
                    description: 'This is a modal notification.',
                },
            },
            onReceive: 'modal',
            onClick: {
                type: 'modal',
            },
            actions: [
                {
                    type: 'updateAndReload',
                    displayText: {
                        'en-US': 'Update and Reload',
                    },
                },
                {
                    type: 'openUrl',
                    url: 'https://aws.amazon.com/visualstudiocode/',
                    displayText: {
                        'en-US': 'Proceed to Wiki',
                    },
                },
                {
                    type: 'openTextDocument',
                    displayText: {
                        'en-US': 'Read More',
                    },
                },
            ],
        },
    }
}
