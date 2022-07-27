/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { createInputBox } from '../../shared/ui/inputPrompter'
import { getIdeProperties } from '../../shared/extensionUtilities'
import { ProfileTemplateProvider } from './createProfile'
import { createCommonButtons } from '../../shared/ui/buttons'
import { credentialHelpUrl } from '../../shared/constants'

// TODO: use this everywhere else
export enum ProfileKey {
    AccessKeyId = 'aws_access_key_id',
    SecretKey = 'aws_secret_access_key',
    Process = 'credential_process',
}

function getTitle(profileName: string): string {
    return localize('AWS.title.createCredentialProfile', 'Creating new profile "{0}"', profileName)
}

interface StaticProfile {
    [ProfileKey.AccessKeyId]: string
    [ProfileKey.SecretKey]: string
}

const accessKeyPattern = /[\w]{16,128}/

export const staticCredentialsTemplate: ProfileTemplateProvider<StaticProfile> = {
    label: 'Static Credentials',
    description: 'Use this for credentials that never expire',
    prompts: {
        [ProfileKey.AccessKeyId]: name =>
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
                validateInput: accessKey => {
                    if (accessKey === '') {
                        return localize('AWS.credentials.error.emptyAccessKey', 'Access key must not be empty')
                    }
                    if (!accessKeyPattern.test(accessKey)) {
                        return localize(
                            'AWS.credentials.error.emptyAccessKey',
                            'Access key must be alphanumeric and between 16 and 128 characters'
                        )
                    }
                },
            }),
        [ProfileKey.SecretKey]: name =>
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
                validateInput: secretKey => {
                    if (secretKey === '') {
                        return localize('AWS.credentials.error.emptySecretKey', 'Secret key must not be empty')
                    }
                },
                password: true,
            }),
    },
}

interface CredentialsProcessProfile {
    [ProfileKey.Process]: string
}

export const processCredentialsTemplate: ProfileTemplateProvider<CredentialsProcessProfile> = {
    label: 'External Process',
    description: 'Creates a new profile that fetches credentials from a process',
    prompts: {
        [ProfileKey.Process]: name =>
            createInputBox({
                title: getTitle(name),
                prompt: 'Enter a command to run',
                buttons: createCommonButtons(credentialHelpUrl),
            }),
    },
}
