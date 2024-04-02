/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import { Credentials } from '@aws-sdk/types'
import { authHelpUrl } from '../../shared/constants'
import globals from '../../shared/extensionGlobals'
import { isCloud9 } from '../../shared/extensionUtilities'
import { messages, showMessageWithCancel, showViewLogsMessage } from '../../shared/utilities/messages'
import { Timeout, waitTimeout } from '../../shared/utilities/timeoutUtils'
import { fromExtensionManifest } from '../../shared/settings'
import { Profile } from './sharedCredentials'
import { createInputBox, promptUser } from '../../shared/ui/input'
import { openUrl } from '../../shared/utilities/vsCodeUtils'

const credentialsTimeout = 300000 // 5 minutes
const credentialsProgressDelay = 1000

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

export function showLoginFailedMessage(credentialsId: string, errMsg: string): void {
    const getHelp = localize('AWS.generic.message.getHelp', 'Get Help...')
    const editCreds = messages.editCredentials(false)
    // TODO: getHelp page for Cloud9.
    const buttons = isCloud9() ? [editCreds] : [editCreds, getHelp]

    void showViewLogsMessage(
        localize('AWS.message.credentials.invalid', 'Credentials "{0}" failed to connect: {1}', credentialsId, errMsg),
        'error',
        buttons
    ).then((selection: string | undefined) => {
        if (selection === getHelp) {
            return openUrl(vscode.Uri.parse(authHelpUrl))
        } else if (selection === editCreds) {
            // TODO: clean this up, its confusing. Only Toolkit should enter this flow, which is why we are hardcoding it.
            // (Also, if we got it dynamically by calling authCommands(), it would be a circular dependency)
            return vscode.commands.executeCommand('aws.toolkit.credentials.edit')
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
    timeout: Timeout | number = credentialsTimeout
): Promise<Credentials> {
    if (typeof timeout === 'number') {
        timeout = new Timeout(timeout)
    }

    globals.clock.setTimeout(() => {
        timeout = timeout as Timeout // Typescript lost scope of the correct type here
        if (timeout.completed !== true) {
            void showMessageWithCancel(
                localize('AWS.message.credentials.pending', 'Getting credentials for profile: {0}', profile),
                timeout
            )
        }
    }, credentialsProgressDelay)

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

export class CredentialsSettings extends fromExtensionManifest('aws', { profile: String }) {}

const errorMessageUserCancelled = localize('AWS.error.mfa.userCancelled', 'User cancelled entering authentication code')

/**
 * @description Prompts user for MFA token
 *
 * Entered token is passed to the callback.
 * If user cancels out, the callback is passed an error with a fixed message string.
 *
 * @param mfaSerial Serial arn of MFA device
 * @param profileName Name of Credentials profile we are asking an MFA Token for
 * @param callback tokens/errors are passed through here
 */
export async function getMfaTokenFromUser(mfaSerial: string, profileName: string): Promise<string> {
    const inputBox = createInputBox({
        options: {
            ignoreFocusOut: true,
            placeHolder: localize('AWS.prompt.mfa.enterCode.placeholder', 'Enter Authentication Code Here'),
            title: localize('AWS.prompt.mfa.enterCode.title', 'MFA Challenge for {0}', profileName),
            prompt: localize('AWS.prompt.mfa.enterCode.prompt', 'Enter code for MFA device {0}', mfaSerial),
        },
    })

    const token = await promptUser({ inputBox: inputBox })

    // Distinguish user cancel vs code entry issues with the error message
    if (!token) {
        throw new Error(errorMessageUserCancelled)
    }

    return token
}
