/*!
 * Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 *
 * This module focuses on the validation of shared credentials properties
 */

import { localize } from 'vscode-nls'
import { SectionName, SharedCredentialsKeys, StaticCredentialsProfileData } from './types'
import { ToolkitError } from '../shared/errors'
import { profileExists } from './sharedCredentials'

/**
 * The format validators for shared credentials keys.
 *
 * A format validator validates the format of the data,
 * but not the validity of the content.
 */
export const CredentialsKeyFormatValidators = {
    [SharedCredentialsKeys.AWS_ACCESS_KEY_ID]: getAccessKeyIdFormatError,
    [SharedCredentialsKeys.AWS_SECRET_ACCESS_KEY]: getSecretAccessKeyFormatError,
} as const

/**
 * Holds the error for each key of static credentials data,
 * if it exists. This allows the user to get all the errors
 * at once.
 */
export type StaticCredentialsErrorResult = {
    [k in keyof StaticCredentialsProfileData]: string | undefined
}

export function getStaticCredentialsDataErrors(
    data: StaticCredentialsProfileData
): StaticCredentialsErrorResult | undefined {
    const accessKeyIdError = CredentialsKeyFormatValidators[SharedCredentialsKeys.AWS_ACCESS_KEY_ID](
        data[SharedCredentialsKeys.AWS_ACCESS_KEY_ID]
    )
    const secretAccessKeyError = CredentialsKeyFormatValidators[SharedCredentialsKeys.AWS_SECRET_ACCESS_KEY](
        data[SharedCredentialsKeys.AWS_SECRET_ACCESS_KEY]
    )

    if (accessKeyIdError === undefined && secretAccessKeyError === undefined) {
        return undefined
    }

    return {
        [SharedCredentialsKeys.AWS_ACCESS_KEY_ID]: accessKeyIdError,
        [SharedCredentialsKeys.AWS_SECRET_ACCESS_KEY]: secretAccessKeyError,
    }
}

const accessKeyPattern = /[\w]{16,128}/

function getAccessKeyIdFormatError(awsAccessKeyId: string | undefined): string | undefined {
    if (awsAccessKeyId === undefined) {
        return undefined
    }

    if (awsAccessKeyId === '') {
        return localize('AWS.credentials.error.emptyAccessKey', 'Access key must not be empty')
    }
    if (!accessKeyPattern.test(awsAccessKeyId)) {
        return localize(
            'AWS.credentials.error.emptyAccessKey',
            'Access key must be alphanumeric and between 16 and 128 characters'
        )
    }
}

function getSecretAccessKeyFormatError(awsSecretAccessKey: string | undefined): string | undefined {
    if (awsSecretAccessKey === undefined) {
        return undefined
    }

    if (awsSecretAccessKey === '') {
        return localize('AWS.credentials.error.emptySecretKey', 'Secret key must not be empty')
    }
}

/** To be used as a sanity check to validate all core parts of a credentials profile */
export async function validateCredentialsProfile(profileName: SectionName, profileData: StaticCredentialsProfileData) {
    if (await profileExists(profileName)) {
        throw new ToolkitError(`Credentials profile "${profileName}" already exists`)
    }

    const credentialsDataErrors = getStaticCredentialsDataErrors(profileData)
    if (credentialsDataErrors !== undefined) {
        throw new ToolkitError(`Errors in credentials data: ${credentialsDataErrors}`, {
            code: 'InvalidCredentialsData',
            details: credentialsDataErrors,
        })
    }
}
