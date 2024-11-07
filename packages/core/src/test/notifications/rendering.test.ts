/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as sinon from 'sinon'
import assert from 'assert'
import { ToolkitNotification } from '../../notifications/types'
import { panelNode } from './controller.test'
import { getTestWindow } from '../shared/vscode/window'
import * as VsCodeUtils from '../../shared/utilities/vsCodeUtils'
import { readonlyDocument } from '../../shared/utilities/textDocumentUtilities'

describe('Notifications Rendering', function () {
    let sandbox: sinon.SinonSandbox
    //const panelNode: NotificationsNode = testNotificationsNode

    beforeEach(function () {
        sandbox = sinon.createSandbox()
    })

    afterEach(function () {
        sandbox.restore()
    })

    // util to test txt pop-up under different senarios
    async function verifyTxtNotification(notification: ToolkitNotification) {
        const expectedContent = notification.uiRenderInstructions.content['en-US'].description
        const readonlyDocumentShowStub = sandbox.stub(readonlyDocument, 'show').resolves()

        await panelNode.openNotification(notification)

        assert.ok(readonlyDocumentShowStub.calledOnce)
        assert.ok(readonlyDocumentShowStub.calledWith(expectedContent, `Notification: ${notification.id}`))
    }

    // util to test open url under different senarios
    async function verifyOpenExternalUrl(notification: ToolkitNotification) {
        const url = vscode.Uri.parse('https://aws.amazon.com/visualstudiocode/')
        //const openExternalStub = getOpenExternalStub()
        const openUrlStub = sandbox.stub(VsCodeUtils, 'openUrl')
        await panelNode.openNotification(notification)

        assert.ok(openUrlStub.calledOnce)
        assert.ok(openUrlStub.calledWith(url))
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
        const notification = getModalNotification()
        await panelNode.openNotification(notification)

        assert.ok(excuteCommandStub.calledWith('workbench.extensions.installExtension', 'aws.toolkit.fake.extension'))
        assert.ok(excuteCommandStub.calledWith('workbench.action.reloadWindow'))
    })

    it('executes openURL type button', async function () {
        const testWindow = getTestWindow()
        testWindow.onDidShowMessage((message) => {
            // Simulate user clicking open URL type
            message.selectItem('Proceed to Wiki')
        })
        const notification = getModalNotification()
        await verifyOpenExternalUrl(notification)
    })

    it('executes openTxt type button', async function () {
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
        id: 'test notification',
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
            onRecieve: 'toast',
            onClick: {
                type: 'openUrl',
                url: 'https://aws.amazon.com/visualstudiocode/',
            },
        },
    }
}

function getTxtNotification(): ToolkitNotification {
    return {
        id: 'test notification',
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
            onRecieve: 'toast',
            onClick: {
                type: 'openTextDocument',
            },
        },
    }
}

function getModalNotification(): ToolkitNotification {
    return {
        id: 'test notification',
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
            onRecieve: 'modal',
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
                    type: 'openTxt',
                    displayText: {
                        'en-US': 'Read More',
                    },
                },
            ],
        },
    }
}
