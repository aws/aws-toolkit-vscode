/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as sinon from 'sinon'
import assert from 'assert'
import { testNotificationsNode, NotificationsNode } from '../../notifications/panelNode'
import { ToolkitNotification } from '../../notifications/types'
import fs from '../../shared/fs/fs'
import path from 'path'
import { tempDirPath } from '../../shared/filesystemUtilities'
import { getTestWindow } from '../shared/vscode/window'

describe('Notifications Rendering', function () {
    let sandbox: sinon.SinonSandbox
    const panelNode: NotificationsNode = testNotificationsNode

    beforeEach(function () {
        sandbox = sinon.createSandbox()
    })

    afterEach(function () {
        sandbox.restore()
    })

    // util to test txt pop-up under different senarios
    async function verifyTxtNotification(notification: ToolkitNotification) {
        const expectedContent = notification.uiRenderInstructions.content['en-US'].description
        const txtDocumentStub = sandbox.stub(vscode.window, 'showTextDocument').resolves({} as vscode.TextEditor)
        const openTxtDocumentStub = sandbox
            .stub(vscode.workspace, 'openTextDocument')
            .resolves({} as vscode.TextDocument)
        const writeFileStub = sandbox.stub(fs, 'writeFile').resolves()

        await panelNode.openNotification(notification)

        assert.ok(openTxtDocumentStub.calledOnce)
        assert.ok(txtDocumentStub.calledOnce)

        const expectedFilePath = path.join(tempDirPath, 'AWSToolkitNotifications.txt')
        assert.ok(writeFileStub.calledWith(expectedFilePath, expectedContent))
    }

    // util to test open url under different senarios
    async function verifyOpenExternalUrl(notification: ToolkitNotification) {
        const url = vscode.Uri.parse('https://aws.amazon.com/visualstudiocode/')
        const openExternalStub = getOpenExternalStub()
        await panelNode.openNotification(notification)

        assert.ok(openExternalStub.calledOnce)
        assert.ok(openExternalStub.calledWith(url))
    }

    // test on-receive behaviors
    it('displays a toast with correct message on receive', async function () {
        const testWindow = getTestWindow()
        testWindow.onDidShowMessage((message) => {})

        const notification = getToastURLTestNotification()
        await panelNode.onReceiveNotifications([notification])

        const expectedMessage =
            notification.uiRenderInstructions.content['en-US'].descriptionPreview ??
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
                    descriptionPreview: 'test toast preview',
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

function getOpenExternalStub(): sinon.SinonStub {
    const originalMethod = vscode.env.openExternal

    // Check if the method is already stubbed
    if (originalMethod) {
        // restore the method to prevent double wrap
        ;(originalMethod as sinon.SinonStub).restore()
    }

    return sinon.stub(vscode.env, 'openExternal').resolves(true)
}
