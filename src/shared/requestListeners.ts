/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { localize } from 'vscode-nls'
import { CredentialsStore } from '../credentials/credentialsStore'
import { LoginManager } from '../credentials/loginManager'
import { ServiceOptions } from './awsClientBuilder'
import { CredentialsProfileMru } from './credentials/credentialsProfileMru'
import globals from './extensionGlobals'

export const CREDENTIAL_ERROR_REQUEST_LISTENER: ServiceOptions = {
    onRequestSetup: [
        req => {
            req.on('error', async err => {
                if (
                    err.name.includes('ExpiredToken') ||
                    err.message.includes('The security token included in the request is expired')
                ) {
                    const loginManager = new LoginManager(globals.awsContext, new CredentialsStore())
                    let retryLoginResult = await loginManager.retryLogin()
                    const profileName = new CredentialsProfileMru(globals.context).getMruList()[0]
                    if (retryLoginResult) {
                        vscode.window.showInformationMessage(
                            localize(
                                'AWS.message.retryLoginSuccessful',
                                'The credentilas "{0}" were invalid or expired. The profile has successfully reconnected.',
                                profileName
                            )
                        )
                    } else {
                        const invalidCredentialMessage = localize(
                            'AWS.message.credentials.error.retry',
                            'The credentials for profile "{0}" are invalid or expired.',
                            profileName
                        )
                        const chooseRetry = localize('AWS.message.retryLogin', 'Retry Login')
                        const changeProfile = localize('AWS.message.changeProfile', 'Change Profile')
                        while (!retryLoginResult) {
                            await vscode.window
                                .showErrorMessage(invalidCredentialMessage, chooseRetry, changeProfile)
                                .then(async selection => {
                                    if (selection === chooseRetry) {
                                        retryLoginResult = await loginManager.retryLogin()
                                    } else if (selection === changeProfile) {
                                        retryLoginResult = true
                                        globals.awsContextCommands.onCommandLogin()
                                    }
                                })
                        }
                    }
                }
            })
        },
    ],
}
