/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { signInToAmazonQ } from '../framework/loginHelper'

before(async function () {
    this.timeout(60000)
    console.log('\n\n*** MANUAL INTERVENTION REQUIRED ***')
    console.log('When prompted, you must manually click to open the browser and complete authentication')
    console.log('You have 60 seconds to complete this step\n\n')
    await signInToAmazonQ()
})
