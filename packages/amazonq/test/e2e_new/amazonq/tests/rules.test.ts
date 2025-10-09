/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import '../utils/setup'
import { WebviewView } from 'vscode-extension-tester'
import { testContext } from '../utils/testContext'
import { createNewRule } from '../helpers/rulesHelper'

describe('Amazon Q Rules Functionality', function () {
    // this timeout is the general timeout for the entire test suite
    this.timeout(300000)
    let webviewView: WebviewView

    before(async function () {
        webviewView = testContext.webviewView
    })

    after(async function () {})

    it('Rules Option Test', async () => {
        await createNewRule(webviewView, 'testRule')
        console.log('Completed createNewRule test')
    })
})
