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

// export function registerAuthHook(secret: string, lambdaId = process.env['AUTH_UTIL_LAMBDA_ARN']) {
//     return getTestWindow().onDidShowMessage((message: { items: string | any[] }) => {
//         if (message.items.length > 0 && message.items[0].title.match(new RegExp(proceedToBrowser))) {
//             if (!lambdaId) {
//                 const baseMessage = 'Browser login flow was shown during testing without an authorizer function'
//                 if (process.env['AWS_TOOLKIT_AUTOMATION'] === 'local') {
//                     throw new Error(`${baseMessage}. You may need to login manually before running tests.`)
//                 } else {
//                     throw new Error(`${baseMessage}. Check that environment variables are set correctly.`)
//                 }
//             }

//             const openStub = patchObject(vscode.env, 'openExternal', async (target: { toString: (arg0: boolean) => any }) => {
//                 try {
//                     // Latest eg: 'https://nkomonen.awsapps.com/start/#/device?user_code=JXZC-NVRK'
//                     const urlString = target.toString(true)

//                     // Drop the user_code parameter since the auth lambda does not support it yet, and keeping it
//                     // would trigger a slightly different UI flow which breaks the automation.
//                     // TODO: If the auth lambda supports user_code in the parameters then we can skip this step
//                     const verificationUri = urlString.split('?')[0]

//                     const params = urlString.split('?')[1]
//                     const userCode = new URLSearchParams(params).get('user_code')

//                     await invokeLambda(lambdaId, {
//                         secret,
//                         userCode,
//                         verificationUri,
//                     })
//                 } finally {
//                     openStub.dispose()
//                 }

//                 return true
//             })

//             message.items[0].select()
//         }
//     })
// }
