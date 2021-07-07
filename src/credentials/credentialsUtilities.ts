/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import { Credentials } from 'aws-sdk'
import { credentialHelpUrl } from '../shared/constants'
import { Profile } from '../shared/credentials/credentialsFile'
import { isCloud9 } from '../shared/extensionUtilities'
import { CredentialsId, asString } from './providers/credentials'
import { waitTimeout, Timeout } from '../shared/utilities/timeoutUtils'
import { showMessageWithCancel } from '../shared/utilities/messages'

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
 * @param provider This can be a Promise that returns Credentials, or void if using 'refresh'
 * @param timeout How long to wait for resolution without user intervention (default: 5 minutes)
 *
 * @returns The resolved Credentials or undefined if the the provider was a 'refresh' Promise
 */
export async function resolveProviderWithCancel<T extends AWS.Credentials | void>(
    profile: string,
    provider: Promise<T>,
    timeout: Timeout | number = CREDENTIALS_TIMEOUT
): Promise<T> {
    if (typeof timeout === 'number') {
        timeout = new Timeout(timeout)
    }

    setTimeout(() => {
        timeout = timeout as Timeout // Typescript lost scope of the correct type here
        if (timeout.completed !== true) {
            showMessageWithCancel(
                localize('AWS.message.credentials.pending', 'Getting credentials for profile: {0}', profile),
                timeout
            )
        }
    }, CREDENTIALS_PROGRESS_DELAY)

    await waitTimeout(provider, timeout, {
        onCancel: () => {
            throw new Error(`Request to get credentials for "${profile}" cancelled`)
        },
        onExpire: () => {
            throw new Error(`Request to get credentials for "${profile}" expired`)
        },
    })

    return provider
}
