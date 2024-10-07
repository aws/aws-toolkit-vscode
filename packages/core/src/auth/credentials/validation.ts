/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 *
 * This module focuses on the validation of shared credentials properties
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()
import { CredentialsData, CredentialsKey, SectionName, SharedCredentialsKeys } from './types'
import { ToolkitError } from '../../shared/errors'
import { profileExists } from './sharedCredentials'
import { getLogger } from '../../shared/logger'

/** credentials keys and their associated error message, if they exists */
type CredentialsErrors = CredentialsData

/**
 * A function that validates a credential value
 *
 * @returns An error message string if there is an error, otherwise undefined.
 */
type GetCredentialError = (key: CredentialsKey, value: string | undefined) => string | undefined

/**
 * Validates all credentials values from the given input
 *
 * @returns Returns the same shape as the input, but the value of each
 * key is an error message if the original value is invalid,
 * otherwise undefined.
 *
 * If there are no errors at all, undefined is returned
 */
export function getCredentialsErrors(
    data: CredentialsData,
    validateFunc: GetCredentialError = getCredentialError
): CredentialsErrors | undefined {
    const errors: CredentialsData = {}
    Object.entries(data).forEach(([key, value]) => {
        if (!isCredentialsKey(key)) {
            return
        }
        errors[key] = validateFunc(key, value)
    })

    const hasErrors = Object.values(errors).some(Boolean)
    if (!hasErrors) {
        return
    }
    return errors
}

export const getCredentialError: GetCredentialError = (key: CredentialsKey, value: string | undefined) => {
    const emptyError = getCredentialEmptyError(key, value)
    if (emptyError) {
        return emptyError
    }

    // If value is allowed to be empty, no need to validate anything further
    if (!value) {
        return
    }

    return getCredentialFormatError(key, value)
}

/**
 * Validates the format of a credential value.
 *
 * This function assumes there is a value to evaluate, if not
 * it returns no error.
 */
export const getCredentialFormatError: GetCredentialError = (key, value) => {
    if (!value) {
        /** Empty values should be validated in {@link getCredentialEmptyError} */
        getLogger().debug('getCredentialFormatError() called with empty value for key "%s"', key)
        return
    }

    switch (key) {
        case SharedCredentialsKeys.AWS_ACCESS_KEY_ID: {
            const accessKeyPattern = /[\w]{16,128}/
            if (!accessKeyPattern.test(value)) {
                return localize(
                    'AWS.credentials.error.invalidAccessKeyFormat',
                    'Access key must be alphanumeric and between 16 and 128 characters'
                )
            }
            return
        }
        case SharedCredentialsKeys.AWS_SECRET_ACCESS_KEY:
            return
        default:
            throw new ToolkitError(`Unsupported key in getCredentialFormatError(): "${key}"`)
    }
}

export const getCredentialEmptyError: GetCredentialError = (key: CredentialsKey, value: string | undefined) => {
    switch (key) {
        case SharedCredentialsKeys.AWS_ACCESS_KEY_ID:
        case SharedCredentialsKeys.AWS_SECRET_ACCESS_KEY:
            if (value) {
                return undefined
            }
            return 'Cannot be empty.'
        default:
            throw new ToolkitError(`Unsupported key in getCredentialEmptyError(): "${key}"`)
    }
}

/** To be used as a sanity check to validate all core parts of a credentials profile */
export async function throwOnInvalidCredentials(profileName: SectionName, data: CredentialsData) {
    await validateProfileName(profileName)

    const credentialsDataErrors = getCredentialsErrors(data)
    if (credentialsDataErrors !== undefined) {
        throw new ToolkitError(`Errors in credentials data: ${String(credentialsDataErrors)}`, {
            code: 'InvalidCredentialsData',
            details: credentialsDataErrors,
        })
    }
}

async function validateProfileName(profileName: SectionName) {
    if (await profileExists(profileName)) {
        throw new ToolkitError(`Credentials profile "${profileName}" already exists`)
    }
}

// All shared credentials keys
const sharedCredentialsKeysSet = new Set(Object.values(SharedCredentialsKeys))

export function isCredentialsKey(key: string): key is CredentialsKey {
    return sharedCredentialsKeysSet.has(key as CredentialsKey)
}
