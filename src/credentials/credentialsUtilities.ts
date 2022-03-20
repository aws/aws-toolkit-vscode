/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import { Credentials } from '@aws-sdk/types'
import { credentialHelpUrl } from '../shared/constants'
import { Profile } from '../shared/credentials/credentialsFile'
import { isCloud9 } from '../shared/extensionUtilities'
import { CredentialsId, asString, fromString } from './providers/credentials'
import { waitTimeout, Timeout } from '../shared/utilities/timeoutUtils'
import { showMessageWithCancel } from '../shared/utilities/messages'
import globals from '../shared/extensionGlobals'
import { CredentialsStore } from './credentialsStore'
import { LoginManager } from './loginManager'
import { ServiceOptions } from '../shared/awsClientBuilder'
import { getLogger } from '../shared/logger/logger'
import { CredentialsProfileMru } from '../shared/credentials/credentialsProfileMru'

const CREDENTIALS_TIMEOUT = 300000 // 5 minutes
const CREDENTIALS_PROGRESS_DELAY = 1000

export function asEnvironmentVariables(credentials: Credentials): NodeJS.ProcessEnv {
    const environmentVariables: NodeJS.ProcessEnv = {}

    environmentVariables.AWS_ACCESS_KEY = credentials.accessKeyId
    environmentVariables.AWS_ACCESS_KEY_ID = credentials.accessKeyId
    environmentVariables.AWS_SECRET_KEY = credentials.secretAccessKey
    environmentVariables.AWS_SECRET_ACCESS_KEY = credentials.secretAccessKey
    environmentVariables.AWS_SESSION_TOKEN = credentials.sessionToken
    environmentVariables.AWS_SECURITY_TOKEN = credentials.sessionToken

    return environmentVariables
}

export function notifyUserInvalidCredentials(credentialProviderId: CredentialsId): void {
    const getHelp = localize('AWS.generic.message.getHelp', 'Get Help...')
    const viewLogs = localize('AWS.generic.message.viewLogs', 'View Logs...')
    // TODO: getHelp link does not have a corresponding doc page in Cloud9 as of initial launch.
    const buttons = isCloud9() ? [viewLogs] : [getHelp, viewLogs]

    vscode.window
        .showErrorMessage(
            localize(
                'AWS.message.credentials.invalid',
                'Invalid Credentials {0}, see logs for more information.',
                asString(credentialProviderId)
            ),
            ...buttons
        )
        .then((selection: string | undefined) => {
            if (selection === getHelp) {
                vscode.env.openExternal(vscode.Uri.parse(credentialHelpUrl))
            } else if (selection === viewLogs) {
                vscode.commands.executeCommand('aws.viewLogs')
            }
        })
}

export function hasProfileProperty(profile: Profile, propertyName: string): boolean {
    return !!profile[propertyName]
}

/**
 * Attempts to resolve (or refresh) a provider with a 'Cancel' progress message.
 * User cancellation or timeout expiration will cause rejection.
 *
 * @param profile Profile name to display for the progress message
 * @param provider A promise that resolves in Credentials
 * @param timeout How long to wait for resolution without user intervention (default: 5 minutes)
 *
 * @returns The resolved Credentials or undefined if the the provider was a 'refresh' Promise
 */
export async function resolveProviderWithCancel(
    profile: string,
    provider: Promise<Credentials>,
    timeout: Timeout | number = CREDENTIALS_TIMEOUT
): Promise<Credentials> {
    if (typeof timeout === 'number') {
        timeout = new Timeout(timeout)
    }

    globals.clock.setTimeout(() => {
        timeout = timeout as Timeout // Typescript lost scope of the correct type here
        if (timeout.completed !== true) {
            showMessageWithCancel(
                localize('AWS.message.credentials.pending', 'Getting credentials for profile: {0}', profile),
                timeout
            )
        }
    }, CREDENTIALS_PROGRESS_DELAY)

    return await waitTimeout(provider, timeout, {
        allowUndefined: false,
        onCancel: () => {
            throw new Error(`Request to get credentials for "${profile}" cancelled`)
        },
        onExpire: () => {
            throw new Error(`Request to get credentials for "${profile}" expired`)
        },
    })
}

export async function retryLogin(): Promise<boolean | undefined> {
    try {
        getLogger().debug('credentials: attempting retry login...')
        const loginManager = new LoginManager(globals.awsContext, new CredentialsStore())
        const mruProfile = new CredentialsProfileMru(globals.context).getMruList()[0]
        return await loginManager.login({ passive: false, providerId: fromString(mruProfile) })
    } catch (err) {
        getLogger().error('credentials: failed to connect on retry: %O', err)
    }
}

export const CREDENTIAL_ERROR_REQUEST_LISTENER: ServiceOptions = {
    onRequestSetup: [
        req => {
            req.on('error', async err => {
                if (
                    err.name.includes('ExpiredToken') ||
                    err.message.includes('The security token included in the request is expired')
                ) {
                    let retryLoginResult = await retryLogin()
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
                                        retryLoginResult = await retryLogin()
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
