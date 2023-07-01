/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { createInputBox } from '../../shared/ui/inputPrompter'
import { getIdeProperties } from '../../shared/extensionUtilities'
import { ProfileTemplateProvider } from './createProfile'
import { createCommonButtons } from '../../shared/ui/buttons'
import { credentialHelpUrl } from '../../shared/constants'
import { SharedCredentialsKeys, StaticProfile } from '../credentials/types'
import { getCredentialError } from '../credentials/validation'

function getTitle(profileName: string): string {
    return localize('AWS.title.createCredentialProfile', 'Creating new profile "{0}"', profileName)
}

export const staticCredentialsTemplate: ProfileTemplateProvider<StaticProfile> = {
    label: 'Static Credentials',
    description: 'Use this for credentials that never expire',
    prompts: {
        [SharedCredentialsKeys.AWS_ACCESS_KEY_ID]: name =>
            createInputBox({
                title: getTitle(name),
                buttons: createCommonButtons(credentialHelpUrl),
                // Example comes from https://docs.aws.amazon.com/STS/latest/APIReference/API_GetAccessKeyInfo.html
                placeholder: 'AKIAIOSFODNN7EXAMPLE',
                prompt: localize(
                    'AWS.placeHolder.inputAccessKey',
                    'Input the {0} Access Key',
                    getIdeProperties().company
                ),
                validateInput: value => getCredentialError(SharedCredentialsKeys.AWS_ACCESS_KEY_ID, value),
            }),
        [SharedCredentialsKeys.AWS_SECRET_ACCESS_KEY]: name =>
            createInputBox({
                title: getTitle(name),
                buttons: createCommonButtons(credentialHelpUrl),
                // Example comes from https://docs.aws.amazon.com/STS/latest/APIReference/API_GetAccessKeyInfo.html
                placeholder: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
                prompt: localize(
                    'AWS.placeHolder.inputSecretKey',
                    'Input the {0} Secret Key',
                    getIdeProperties().company
                ),
                validateInput: value => getCredentialError(SharedCredentialsKeys.AWS_SECRET_ACCESS_KEY, value),
                password: true,
            }),
    },
}

interface CredentialsProcessProfile {
    [SharedCredentialsKeys.CREDENTIAL_PROCESS]: string
}

export const processCredentialsTemplate: ProfileTemplateProvider<CredentialsProcessProfile> = {
    label: 'External Process',
    description: 'Creates a new profile that fetches credentials from a process',
    prompts: {
        [SharedCredentialsKeys.CREDENTIAL_PROCESS]: name =>
            createInputBox({
                title: getTitle(name),
                prompt: 'Enter a command to run',
                buttons: createCommonButtons(credentialHelpUrl),
            }),
    },
}
