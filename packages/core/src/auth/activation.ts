/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { Auth } from './auth'
import { LoginManager } from './deprecated/loginManager'
import { fromString } from './providers/credentials'
import { initializeCredentialsProviderManager } from './utils'
import { isAmazonQ, isSageMaker } from '../shared/extensionUtilities'
import { getLogger } from '../shared/logger/logger'
import { getErrorMsg } from '../shared/errors'
import { invokeLambda, patchObject } from '../test/setupUtil'

export interface SagemakerCookie {
    authMode?: 'Sso' | 'Iam'
}

// when the extension starts up, it runs this code, have it isolated here
// first, verify with logs before or after auth, if thats true, if all those environment variables
// once
/**
 * Based on the debugging messages, this code gets activated the moment i press opne
 *
 *
 */
export async function initialize(loginManager: LoginManager): Promise<void> {
    console.log('INITIALIZATION START')
    getLogger().info('[DEBUG] Auth activation initialize() called')

    if (true) {
        console.log('AUTH LAMBDA HAS BEEN TRIGGERED')
        registerAuthHook('amazonq-test-account')
        return
    }

    if (isAmazonQ() && isSageMaker()) {
        getLogger().info('[DEBUG] Running in Amazon Q + SageMaker environment')
        try {
            getLogger().info('[DEBUG] Attempting to parse SageMaker cookies')
            // The command `sagemaker.parseCookies` is registered in VS Code Sagemaker environment.
            const result = (await vscode.commands.executeCommand('sagemaker.parseCookies')) as SagemakerCookie
            getLogger().info('[DEBUG] SageMaker cookie result:', result)
            if (result.authMode !== 'Sso') {
                getLogger().info('[DEBUG] Initializing credentials provider manager for IAM mode')
                initializeCredentialsProviderManager()
            } else {
                getLogger().info('[DEBUG] Using SSO mode, skipping credentials provider manager')
            }
        } catch (e) {
            getLogger().info('[DEBUG] Error parsing SageMaker cookies:', e)
            const errMsg = getErrorMsg(e as Error)
            if (errMsg?.includes("command 'sagemaker.parseCookies' not found")) {
                getLogger().warn(`Failed to execute command "sagemaker.parseCookies": ${e}`)
            } else {
                throw e
            }
        }
    } else {
        getLogger().info('[DEBUG] Not in Amazon Q + SageMaker environment')
    }
    getLogger().info('[DEBUG] Setting up Auth connection change listener')
    Auth.instance.onDidChangeActiveConnection(async (conn) => {
        getLogger().info('[DEBUG] Auth connection changed:', conn)
        // This logic needs to be moved to `Auth.useConnection` to correctly record `passive`
        if (conn?.type === 'iam' && conn.state === 'valid') {
            getLogger().info('[DEBUG] Logging in with IAM connection')
            await loginManager.login({ passive: true, providerId: fromString(conn.id) })
        } else {
            getLogger().info('[DEBUG] Logging out - connection invalid or not IAM')
            await loginManager.logout()
        }
    })

    getLogger().info('[DEBUG] Auth activation initialize() completed')
}

export function registerAuthHook(secret: string, lambdaId = process.env['AUTH_UTIL_LAMBDA_ARN']) {
    const openStub = patchObject(vscode.env, 'openExternal', async (target) => {
        try {
            if (!lambdaId) {
                return false
            }

            // Latest eg: 'https://nkomonen.awsapps.com/start/#/device?user_code=JXZC-NVRK'
            const urlString = target.toString(true)

            // Drop the user_code parameter since the auth lambda does not support it yet, and keeping it
            // would trigger a slightly different UI flow which breaks the automation.
            // TODO: If the auth lambda supports user_code in the parameters then we can skip this step
            const verificationUri = urlString.split('?')[0]

            const params = urlString.split('?')[1]
            const userCode = new URLSearchParams(params).get('user_code')

            await invokeLambda(lambdaId, {
                secret,
                userCode,
                verificationUri,
            })
        } finally {
            openStub.dispose()
        }
        return true
    })
}
