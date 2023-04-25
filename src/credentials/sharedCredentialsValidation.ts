/*!
 * Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 *
 * This module focuses on the validation of shared credentials properties
 */

import { localize } from 'vscode-nls'
import { SharedCredentialsKeys } from './types'

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

const accessKeyPattern = /[\w]{16,128}/

function getAccessKeyIdFormatError(awsAccessKeyId: string): string | undefined {
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

function getSecretAccessKeyFormatError(awsSecretAccessKey: string): string | undefined {
    if (awsSecretAccessKey === '') {
        return localize('AWS.credentials.error.emptySecretKey', 'Secret key must not be empty')
    }
}
