/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import '../utils/setup'
import { WebviewView, ActivityBar, DefaultTreeSection, SideBarView, VSBrowser } from 'vscode-extension-tester'
import { testContext } from '../utils/testContext'
import { createNewRule } from '../helpers/rulesHelper'
import path from 'path'
import { sleep } from '../utils/generalUtils'

describe('Amazon Q Rules Functionality', function () {
    // this timeout is the general timeout for the entire test suite
    this.timeout(150000)
    let webviewView: WebviewView

    before(async function () {
        // we assume that we've left off on a webview from a previous test
        webviewView = testContext.webviewView
        await webviewView.switchBack()

        // the "rules" menu won't show unless we have a folder open
        await VSBrowser.instance.openResources(path.join('..', 'utils', 'resources', 'testFolder'))
        const explorerControl = await new ActivityBar().getViewControl('Explorer')
        await explorerControl?.openView()
        const view = new SideBarView()
        const content = view.getContent()
        const tree = (await content.getSection('testFolder')) as DefaultTreeSection
        await tree.openItem('test-folder')
        const workbench = testContext.workbench
        await workbench.executeCommand('Amazon Q: Open Chat')

        // sleep is needed                  because the workbench needs some time to load
        await sleep(5000)
        const activityBar = new ActivityBar()
        const amazonQControl = await activityBar.getViewControl('Amazon Q')
        await amazonQControl?.openView()

        // sleep is needed because it takes time to switch to the AmazonQ webview
        await sleep(5000)
        webviewView = new WebviewView()
        await webviewView.switchToFrame()
        testContext.webviewView = webviewView
    })

    after(async function () {})

    it('Rules Option Test', async () => {
        await createNewRule(webviewView, 'testRule')
    })
})
