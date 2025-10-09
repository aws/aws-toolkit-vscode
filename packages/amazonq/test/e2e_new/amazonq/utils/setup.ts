/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { signInToAmazonQ } from './authUtils'
import { testContext } from './testContext'
import { closeAllTabs } from './cleanupUtils'
import { VSBrowser } from 'vscode-extension-tester'
import path from 'path'
import { rm } from 'fs/promises'

before(async function () {
    this.timeout(60000)
    await VSBrowser.instance.openResources(path.join(__dirname, '..', 'utils', 'resources', 'testFolder'))
    console.log('\n\n*** MANUAL INTERVENTION REQUIRED ***')
    console.log('When prompted, you must manually click to open the browser and complete authentication')
    console.log('You have 60 seconds to complete this step\n\n')
    await signInToAmazonQ()
    const webviewView = testContext.webviewView
    await closeAllTabs(webviewView)
})

after(async function () {
    const amazonqFolder = path.join(__dirname, '..', 'utils', 'resources', 'testFolder', '.amazonq')
    await rm(amazonqFolder, { recursive: true, force: true }).catch(() => {})
})
