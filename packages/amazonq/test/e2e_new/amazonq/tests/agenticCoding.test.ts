/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import '../utils/setup'
import { WebviewView } from 'vscode-extension-tester'
import { testContext } from '../utils/testContext'
import { closeAllTabs } from '../utils/cleanupUtils'
import { clickAcknowledgeButton, clickAWSResponsibleAIPolicy, toggleAgenticChat } from '../helpers/agenticCodingHelper'
import { findItemByText, findMynahCards } from '../utils/generalUtils'

describe('Amazon Q Agentic Coding Functionality', function () {
    // this timeout is the general timeout for the entire test suite
    this.timeout(150000)
    let webviewView: WebviewView

    before(async function () {
        webviewView = testContext.webviewView
    })

    after(async function () {
        await closeAllTabs(webviewView)
    })

    it('Click AWS Responsible AI Policy', async () => {
        await clickAWSResponsibleAIPolicy(webviewView)
    })

    it('Clicks on acknowledge button', async () => {
        await clickAcknowledgeButton(webviewView)
    })

    it('Allows User to ON or OFF Agentic Coding with AmazonQ', async () => {
        webviewView = testContext.webviewView
        await toggleAgenticChat(webviewView)
        const textElements = await findMynahCards(webviewView)
        await findItemByText(textElements, 'Agentic coding - OFF')
        await toggleAgenticChat(webviewView)
        const textElements1 = await findMynahCards(webviewView)
        await findItemByText(textElements1, 'Agentic coding - ON')
    })
})
