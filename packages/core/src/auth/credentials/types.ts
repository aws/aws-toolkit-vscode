/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * All keys that are shared between a credentials or config file
 */
export const SharedCredentialsKeys = {
    AWS_ACCESS_KEY_ID: 'aws_access_key_id',
    AWS_SECRET_ACCESS_KEY: 'aws_secret_access_key',
    AWS_SESSION_TOKEN: 'aws_session_token',
    CREDENTIAL_PROCESS: 'credential_process',
    CREDENTIAL_SOURCE: 'credential_source',
    REGION: 'region',
    ROLE_ARN: 'role_arn',
    SOURCE_PROFILE: 'source_profile',
    MFA_SERIAL: 'mfa_serial',
    SSO_START_URL: 'sso_start_url',
    SSO_REGION: 'sso_region',
    SSO_ACCOUNT_ID: 'sso_account_id',
    SSO_ROLE_NAME: 'sso_role_name',
    SSO_SESSION: 'sso_session',
    SSO_REGISTRATION_SCOPES: 'sso_registration_scopes',
} as const

/** An object that has only credentials data */
export type CredentialsData = Partial<Record<CredentialsKey, string>>

export type CredentialsKey = (typeof SharedCredentialsKeys)[keyof typeof SharedCredentialsKeys]

/**
 * The required keys for a static credentials profile
 *
 * https://docs.aws.amazon.com/sdkref/latest/guide/feature-static-credentials.html
 */
export type StaticProfileOptional = Pick<CredentialsData, 'aws_access_key_id' | 'aws_secret_access_key'>
export type StaticProfile = Required<StaticProfileOptional>
export type StaticProfileKey = keyof StaticProfile
/** An error for a specific static profile key */
export type StaticProfileKeyErrorMessage = { key: StaticProfileKey; error: string }

/**
 * The name of a section in a credentials/config file
 *
 * The is the value of `{A}` in `[ {A} ]` or `[ {B} {A} ]`.
 */
export type SectionName = string
