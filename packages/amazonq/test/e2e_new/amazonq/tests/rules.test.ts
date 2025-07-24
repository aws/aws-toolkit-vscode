/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import '../utils/setup'
import {
    WebviewView,
    VSBrowser,
    DefaultTreeSection,
    ActivityBar,
    SideBarView,
    ViewContent,
    Workbench,
} from 'vscode-extension-tester'
import { closeAllTabs } from '../utils/cleanupUtils'
import { testContext } from '../utils/testContext'
import * as path from 'path'
import { clickRulesButton, createRule } from '../helpers/rulesHelper'

describe('Amazon Q Rules Functionality', function () {
    // this timeout is the general timeout for the entire test suite
    this.timeout(150000)
    let webviewView: WebviewView
    let tree: DefaultTreeSection
    let content: ViewContent
    let workbench: Workbench

    before(async function () {
        // switch out of the webview (we assume that the last test was a webview test)
        webviewView = testContext.webviewView
        await webviewView.switchBack()

        // in order to access rules you must have at least 1 folder
        await VSBrowser.instance.openResources(path.join('..', 'utils', 'resources', 'testFolder'))
        ;(await new ActivityBar().getViewControl('Explorer'))?.openView()
        const view = new SideBarView()
        content = view.getContent()
        tree = (await content.getSection('testFolder')) as DefaultTreeSection
        await tree.openItem('test-folder')

        // once the folder is opened, we switch back to the amazonQ webview
        workbench = testContext.workbench
        await workbench.executeCommand('Amazon Q: Open Chat')
        webviewView = new WebviewView()
        await webviewView.switchToFrame()
        testContext.webviewView = webviewView
    })

    after(async function () {
        await closeAllTabs(webviewView)
    })

    it('Rules Option Test', async () => {
        await clickRulesButton(webviewView)
        await createRule(webviewView)
    })
})
