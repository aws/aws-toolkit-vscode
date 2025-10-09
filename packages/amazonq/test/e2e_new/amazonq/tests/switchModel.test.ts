/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import '../utils/setup'
import { WebviewView } from 'vscode-extension-tester'
import { testContext } from '../utils/testContext'
import { listModels, selectModel } from '../helpers/switchModelHelper'
import { closeAllTabs } from '../utils/cleanupUtils'

describe('Amazon Q Switch Model Functionality', function () {
    // this timeout is the general timeout for the entire test suite
    this.timeout(150000)
    let webviewView: WebviewView

    before(async function () {
        webviewView = testContext.webviewView
    })

    after(async function () {
        await closeAllTabs(webviewView)
    })

    it('Switch Model Test', async () => {
        await listModels(webviewView)
        await selectModel(webviewView, 'Claude Sonnet 4.5 - experimental')
        await selectModel(webviewView, 'Claude Sonnet 4')
    })
})
