/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import '../utils/setup'
import { WebviewView } from 'vscode-extension-tester'
import { closeAllTabs } from '../utils/cleanupUtils'
import { testContext } from '../utils/testContext'
import { clickRulesButton } from '../helpers/rulesHelper'
import { sleep } from '../utils/generalUtils'

describe('Amazon Q Rules Functionality', function () {
    // this timeout is the general timeout for the entire test suite
    this.timeout(150000)
    let webviewView: WebviewView

    before(async function () {
        webviewView = testContext.webviewView
    })

    after(async function () {
        await closeAllTabs(webviewView)
    })

    afterEach(async () => {})

    it('Rules Test', async () => {
        /**
         * TODO abstractions
         *
         * click the rules button DONE
         * list all the possible rules (disappearing overlay again UGH)
         * check and uncheck a rule
         * click create new rule
         * enter rule name
         * click create rule
         * click cancel rule
         */
        await clickRulesButton(webviewView)

        await sleep(5000)
    })
})
