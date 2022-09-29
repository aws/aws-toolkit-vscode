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
import { credentialHelpUrl, ssoCredentialsHelpUrl } from '../../shared/constants'
import { SsoAccessTokenProvider } from '../sso/ssoAccessTokenProvider'
import { AccountInfo, RoleInfo } from '@aws-sdk/client-sso'
import { createQuickPick } from '../../shared/ui/pickerPrompter'
import { SsoClient } from '../sso/clients'
import { createRegionPrompter } from '../../shared/ui/common/region'
import { assertHasProps } from '../../shared/utilities/tsUtils'

// TODO: use this everywhere else
export enum ProfileKey {
    AccessKeyId = 'aws_access_key_id',
    SecretKey = 'aws_secret_access_key',
    Process = 'credential_process',
    SsoStartUrl = 'sso_start_url',
    SsoRegion = 'sso_region',
    SsoAccountId = 'sso_account_id',
    SsoRoleName = 'sso_role_name',
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

interface SsoProfile {
    [ProfileKey.SsoRegion]: string
    [ProfileKey.SsoStartUrl]: string
    [ProfileKey.SsoAccountId]: string
    [ProfileKey.SsoRoleName]: string
}

function createStartUrlPrompter() {
    return createInputBox({
        title: localize('AWS.sso.promptStartUrl.title', 'Enter a start URL'),
        placeholder: 'https://example.com/start',
        buttons: createCommonButtons(ssoCredentialsHelpUrl),
    })
}

function createAccountPrompter(provider: SsoAccessTokenProvider, region: string) {
    function toItem(account: AccountInfo & { accountId: string }) {
        return {
            label: account.accountId,
            description: account.accountName,
            detail: account.emailAddress,
            data: account,
        }
    }

    const client = SsoClient.create(region, provider)
    const items = client.listAccounts({}).map(accounts => accounts.map(toItem))

    return createQuickPick(items, {
        title: localize('AWS.sso.promptAccount.title', 'Select an account'),
        buttons: createCommonButtons(ssoCredentialsHelpUrl),
    })
}

function createRolePrompter(provider: SsoAccessTokenProvider, region: string, accountId: string) {
    function toItem(role: Required<RoleInfo>) {
        return {
            label: role.roleName,
            data: role,
        }
    }

    const client = SsoClient.create(region, provider)
    const items = client.listAccountRoles({ accountId }).map(roles => roles.map(toItem))

    return createQuickPick(items, {
        title: localize('AWS.sso.promptRole.title', 'Select a role from {0}', accountId),
        buttons: createCommonButtons(ssoCredentialsHelpUrl),
    })
}

export const ssoCredentialsTemplate: ProfileTemplateProvider<SsoProfile> = {
    label: 'Single Sign-On (SSO)',
    description: 'Creates a new profile using SSO',
    prompts: {
        [ProfileKey.SsoRegion]: () => createRegionPrompter().transform(r => r.id),
        [ProfileKey.SsoStartUrl]: () => createStartUrlPrompter(),
        [ProfileKey.SsoAccountId]: (_name, state) => {
            assertHasProps(state, ProfileKey.SsoRegion, ProfileKey.SsoStartUrl)
            const tokenProvider = SsoAccessTokenProvider.create({
                region: state[ProfileKey.SsoRegion],
                startUrl: state[ProfileKey.SsoStartUrl],
            })

            return createAccountPrompter(tokenProvider, state[ProfileKey.SsoRegion]).transform(r => r.accountId)
        },
        [ProfileKey.SsoRoleName]: (_name, state) => {
            assertHasProps(state, ProfileKey.SsoRegion, ProfileKey.SsoStartUrl, ProfileKey.SsoRoleName)
            const tokenProvider = SsoAccessTokenProvider.create({
                region: state[ProfileKey.SsoRegion],
                startUrl: state[ProfileKey.SsoStartUrl],
            })

            return createRolePrompter(
                tokenProvider,
                state[ProfileKey.SsoRegion],
                state[ProfileKey.SsoRoleName]
            ).transform(r => r.roleName)
        },
    },
}
