/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { signInToAmazonQ } from './authUtils'
import { testContext } from './testContext'
import { closeAllTabs } from './cleanupUtils'
import { isRunningInGitHubActionsE2E } from './ciUtils'

before(async function () {
    this.timeout(60000)

    if (isRunningInGitHubActionsE2E()) {
        console.log('\n\n*** CI AUTHENTICATION MODE ***')
        console.log('Using Lambda function for automated authentication\n\n')
        // CI authentication will be handled during the auth flow
    } else {
        console.log('\n\n*** MANUAL INTERVENTION REQUIRED ***')
        console.log('When prompted, you must manually click to open the browser and complete authentication')
        console.log('You have 60 seconds to complete this step\n\n')
    }

    await signInToAmazonQ()
    const webviewView = testContext.webviewView
    await closeAllTabs(webviewView)
})
