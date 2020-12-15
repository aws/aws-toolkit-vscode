/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import { Credentials } from 'aws-sdk'
import { credentialHelpUrl } from '../shared/constants'
import { isCloud9 } from '../shared/extensionUtilities'
import { CredentialsProviderId, asString } from './providers/credentialsProviderId'

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

export function notifyUserInvalidCredentials(credentialProviderId: CredentialsProviderId): void {
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
