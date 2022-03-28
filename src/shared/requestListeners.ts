/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { CredentialsStore } from '../credentials/credentialsStore'
import { LoginManager } from '../credentials/loginManager'
import { fromString } from '../credentials/providers/credentials'
import { RequestListener } from './awsClientBuilder'
import globals from './extensionGlobals'
import { getLogger } from './logger/logger'

const localize = nls.loadMessageBundle()

export const CREDENTIAL_ERROR_REQUEST_LISTENER: RequestListener = req => {
    let hasSeenExpiredError = false
    req.on('error', async err => {
        if (
            (err.name.includes('ExpiredToken') ||
                err.message.includes('The security token included in the request is expired')) &&
            !hasSeenExpiredError
        ) {
            hasSeenExpiredError = true
            const loginManager = new LoginManager(globals.awsContext, new CredentialsStore())
            const profileName = globals.awsContext.getCredentialProfileName()
            if (!profileName) {
                return
            }
            let retryLoginResult = await loginManager.login({ passive: true, providerId: fromString(profileName) })
            if (retryLoginResult) {
                getLogger().info('credentials: Reconnect successfull')
            }
            const invalidCredentialMessage = localize(
                'AWS.message.credentials.error.retry',
                'The credentials for "{0}" are invalid or expired.',
                profileName
            )
            const chooseRetry = localize('AWS.message.retryLogin', 'Retry Login')
            const changeProfile = localize('AWS.message.changeProfile', 'Change Profile')
            while (!retryLoginResult) {
                await vscode.window
                    .showErrorMessage(invalidCredentialMessage, chooseRetry, changeProfile)
                    .then(async selection => {
                        if (selection === chooseRetry) {
                            retryLoginResult = await loginManager.login({
                                passive: false,
                                providerId: fromString(profileName),
                                skipErrorMessage: true,
                            })
                        } else if (selection === changeProfile) {
                            retryLoginResult = true
                            globals.awsContextCommands.onCommandLogin()
                        }
                    })
            }
        }
    })
}
