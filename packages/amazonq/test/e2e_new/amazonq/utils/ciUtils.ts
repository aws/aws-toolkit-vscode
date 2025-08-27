/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

interface AuthorizeRequest {
    readonly secret: string
    readonly userCode: string
    readonly verificationUri: string
}

/**
 * Checks if the current environment is running in GitHub Actions CI for e2e tests
 */
export function isRunningInGitHubActionsE2E(): boolean {
    return (
        process.env.GITHUB_ACTIONS === 'true' &&
        process.env.CI === 'true' &&
        (process.env.GITHUB_JOB?.includes('e2e') === true ||
            process.env.GITHUB_WORKFLOW?.toLowerCase().includes('e2e') === true)
    )
}

/**
 * Invokes the auth Lambda function for CI automation
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
