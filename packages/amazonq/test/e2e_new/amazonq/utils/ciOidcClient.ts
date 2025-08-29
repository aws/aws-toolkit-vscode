/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { isRunningInGitHubActionsE2E, invokeAuthLambda } from './ciUtils'

/**
 * CI-specific authentication that bypasses browser interaction
 */
export async function authenticateForCI(): Promise<void> {
    if (!isRunningInGitHubActionsE2E()) {
        throw new Error('This function should only be called in CI environments')
    }

    // Mock the device authorization flow for CI
    const mockUserCode = 'CI_AUTO_CODE'
    const mockVerificationUri = 'https://amzn.awsapps.com/start'

    console.log('CI Authentication: Invoking Lambda with mock device authorization')
    await invokeAuthLambda(mockUserCode, mockVerificationUri)

    // Give the Lambda time to complete the authentication
    await new Promise((resolve) => setTimeout(resolve, 10000))

    console.log('CI Authentication: Lambda invocation completed')
}
