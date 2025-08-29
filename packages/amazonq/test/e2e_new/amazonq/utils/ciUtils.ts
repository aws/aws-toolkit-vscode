/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// import * as vscode from 'vscode'
// import { getTestWindow } from 'vscode-extension-tester'
// import { patchObject } from '../../../core/test/shared/utilities/patchObject'
// import { invokeLambda } from './ciOidcClient'

interface AuthorizeRequest {
    readonly secret: string
    readonly userCode: string
    readonly verificationUri: string
}

// const proceedToBrowser = 'Proceed to browser'

/**
 * Checks if the current environment is running in GitHub Actions CI for e2e tests
 */
export function isRunningInGitHubActionsE2E(): boolean {
    return (
        true == true
        // process.env.GITHUB_ACTIONS === 'true' &&
        // process.env.CI === 'true' &&
        // (process.env.GITHUB_JOB?.includes('e2e') === true ||
        //     process.env.GITHUB_WORKFLOW?.toLowerCase().includes('e2e') === true)
    )
}

/**
 * Invokes the auth Lambda function for CI automation
 *
 *
 *
 * Josh's implementation
 */
export async function invokeAuthLambda(userCode: string, verificationUri: string): Promise<void> {
    const lambdaArn = process.env.AUTH_UTIL_LAMBDA_ARN
    if (!lambdaArn) {
        throw new Error('AUTH_UTIL_LAMBDA_ARN environment variable is required for CI authentication')
    }

    const AWS = require('aws-sdk')
    const lambda = new AWS.Lambda()

    const request: AuthorizeRequest = {
        secret: 'GitHubBot/AuthSecret', // Default secret name
        userCode,
        verificationUri,
    }

    await lambda
        .invoke({
            FunctionName: lambdaArn,
            Payload: JSON.stringify(request),
        })
        .promise()
}

// export async function registerAuthHook(secret: string, lambdaId = process.env['AUTH_UTIL_LAMBDA_ARN']) {
//     // Latest eg: 'https://nkomonen.awsapps.com/start/#/device?user_code=JXZC-NVRK'
//     const urlString = 'https://oidc.us-east-1.amazonaws.com/authorize?response_type=code&client_id=-yit8OUGd-Hnuxi-wde3dHVzLWVhc3QtMQ&redirect_uri=http://127.0.0.1:53085/oauth/callback&scopes=codewhisperer:completions,codewhisperer:analysis,codewhisperer:conversations,codewhisperer:transformations,codewhisperer:taskassist&state=2f35c7c1-0398-489d-8839-26323587cab6&code_challenge=iL8MZPd_SldEB3B4Y0tKrPjHGRlFt5_r3FYziVNbm9g&code_challenge_method=S256'

//     // Drop the user_code parameter since the auth lambda does not support it yet, and keeping it
//     // would trigger a slightly different UI flow which breaks the automation.
//     // TODO: If the auth lambda supports user_code in the parameters then we can skip this step
//     const verificationUri = urlString.split('?')[0]

//     const params = urlString.split('?')[1]
//     const userCode = new URLSearchParams(params).get('user_code')

//     await invokeLambda(lambdaId, {
//         secret,
//         userCode,
//         verificationUri,
//     })
// }
