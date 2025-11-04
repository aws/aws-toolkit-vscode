/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import '../utils/setup'
import { WebviewView } from 'vscode-extension-tester'
import { closeAllTabs } from '../utils/cleanupUtils'
import { testContext } from '../utils/testContext'
import {
    clickAddPromptButton,
    clickCreatePromptButton,
    clickPinContextButton,
    clickPinContextMenuItem,
    clickSubMenuItem,
    enterChatInput,
} from '../helpers/pinContextHelper'

describe('Amazon Q Pin Context Functionality', function () {
    // this timeout is the general timeout for the entire test suite
    this.timeout(150000)
    let webviewView: WebviewView

    before(async function () {
        webviewView = testContext.webviewView
    })

    afterEach(async () => {
        await closeAllTabs(webviewView)
    })

    it('Allows User to Add File Context', async () => {
        await clickPinContextButton(webviewView)
        await clickPinContextMenuItem(webviewView, 'Files')
        await clickSubMenuItem(webviewView, 'Active file')
    })

    it('Allows User to Pin Workspace Context', async () => {
        await clickPinContextButton(webviewView)
        await clickPinContextMenuItem(webviewView, '@workspace')
    })

    it('Allows User to Add Prompt Context', async () => {
        await clickPinContextButton(webviewView)
        await clickPinContextMenuItem(webviewView, 'Prompts')
        await clickAddPromptButton(webviewView)
        await enterChatInput(webviewView)
        await clickCreatePromptButton(webviewView)
        await clickPinContextButton(webviewView)
        await clickPinContextMenuItem(webviewView, 'Prompts')
        await clickSubMenuItem(webviewView, 'test')
    })
})
