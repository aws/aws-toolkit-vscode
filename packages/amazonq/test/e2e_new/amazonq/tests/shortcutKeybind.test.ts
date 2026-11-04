/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import '../utils/setup'
import { Key, WebviewView } from 'vscode-extension-tester'
import { testContext } from '../utils/testContext'
import {
    waitForChatResponse,
    writeToChat,
    findItemByText,
    findMynahCardsBody,
    pressShortcut,
    sleep,
    clearChatInput,
} from '../utils/generalUtils'
import { closeAllTabs, dismissOverlayIfPresent } from '../utils/cleanupUtils'
import {
    hoverButtonAndValidateTooltip,
    rejectShellCommand,
    runShellCommand,
    stopShellCommand,
    waitForLoadingComplete,
} from '../helpers/shortcutHelper'

describe('Amazon Q Shortcut Keybind Functionality Tests', function () {
    // this timeout is the general timeout for the entire test suite
    this.timeout(150000)
    let webviewView: WebviewView

    beforeEach(async function () {
        webviewView = testContext.webviewView
        await writeToChat('Run git log', webviewView)
        await waitForChatResponse(webviewView)
    })

    afterEach(async function () {
        await clearChatInput(webviewView)
        await closeAllTabs(webviewView)
    })

    it('Allows User to reject Using Keyboard shortcut', async () => {
        await waitForLoadingComplete(webviewView)
        await sleep(7000)
        const driver = webviewView.getDriver()
        await pressShortcut(driver, Key.CONTROL, Key.SHIFT, 'r')
        await waitForChatResponse(webviewView, 2000)
        const list = await findMynahCardsBody(webviewView)
        await sleep(2000)
        await findItemByText(list, 'Command was rejected')
    })

    it('Allows User to run Using Keyboard shortcut', async () => {
        await sleep(5000)
        const driver = webviewView.getDriver()
        await pressShortcut(driver, Key.CONTROL, Key.SHIFT, Key.ENTER)
        await waitForChatResponse(webviewView)
    })

    it('Allows User to stop Using Keyboard shortcut', async () => {
        await sleep(5000)
        const driver = webviewView.getDriver()
        await pressShortcut(driver, Key.CONTROL, Key.SHIFT, Key.BACK_SPACE)
        await waitForChatResponse(webviewView)
        await sleep(2000)
        const list = await findMynahCardsBody(webviewView)
        await findItemByText(
            list,
            'You stopped your current work, please provide additional examples or ask another question'
        )
    })

    it('Verifies Stop Button Tooltip Shows Correct Shortcut', async () => {
        await sleep(1000)
        await hoverButtonAndValidateTooltip(webviewView, '.mynah-chat-prompt-stop-button', 'Stop: ⇧ ⌘ ⌫')
    })

    it('Verifies Reject Button Tooltip Shows Correct Shortcut', async () => {
        await dismissOverlayIfPresent(webviewView)
        await sleep(3000)
        await hoverButtonAndValidateTooltip(webviewView, '[action-id="reject-shell-command"]', 'Reject: ⇧ ⌘ R')
    })

    it('Verifies Run Button Tooltip Shows Correct Shortcut', async () => {
        await dismissOverlayIfPresent(webviewView)
        await waitForLoadingComplete(webviewView)
        await sleep(3000)
        await hoverButtonAndValidateTooltip(webviewView, '[action-id="run-shell-command"]', 'Run: ⇧ ⌘ ↵')
    })

    it('Allows User to stop Using Keybind', async () => {
        await stopShellCommand(webviewView)
        await waitForChatResponse(webviewView)
        await sleep(2000)
        const list = await findMynahCardsBody(webviewView)
        await findItemByText(
            list,
            'You stopped your current work, please provide additional examples or ask another question'
        )
        await sleep(100)
    })

    it('Allows User to run Using Keybind', async () => {
        await sleep(7000)
        await rejectShellCommand(webviewView)
        await waitForChatResponse(webviewView)
    })

    it('Allows User to reject Using Keybind', async () => {
        await sleep(7000)
        await runShellCommand(webviewView)
        await waitForChatResponse(webviewView)
        const list = await findMynahCardsBody(webviewView)
        await findItemByText(list, 'Command was rejected')
    })
})
