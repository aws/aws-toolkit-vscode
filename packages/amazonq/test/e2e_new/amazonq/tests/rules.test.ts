/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import '../utils/setup'
import { WebviewView } from 'vscode-extension-tester'
import { testContext } from '../utils/testContext'
import { createNewRule, GenerateMemoryBank } from '../helpers/rulesHelper'
import { closeAllTabs } from '../utils/cleanupUtils'

describe('Amazon Q Rules Functionality', function () {
    // this timeout is the general timeout for the entire test suite
    this.timeout(300000)
    let webviewView: WebviewView

    before(async function () {
        webviewView = testContext.webviewView
    })

    afterEach(async function () {
        await closeAllTabs(webviewView)
    })

    it('Rules Option Test', async () => {
        await createNewRule(webviewView, 'testRule')
    })

    it('Generate Memory Bank Test', async () => {
        await GenerateMemoryBank(webviewView)
    })
})
