/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { notifySamCliValidation } from './samCliValidationNotification'
import {
    InvalidSamCliError,
    InvalidSamCliVersionError,
    SamCliNotFoundError,
    SamCliValidatorResult,
    SamCliVersionValidation,
} from './samCliValidator'

export function throwIfInvalid(validationResult: SamCliValidatorResult): void {
    if (!validationResult.samCliFound) {
        throw new SamCliNotFoundError()
    }

    if (!validationResult.versionValidation) {
        // This should never happen
        throw new Error('SAM CLI detected but version validation is missing')
    }

    if (validationResult.versionValidation.validation === SamCliVersionValidation.Valid) {
        // valid state
        return
    }

    // Invalid version
    throw new InvalidSamCliVersionError(validationResult.versionValidation)
}

export function throwAndNotifyIfInvalid(validationResult: SamCliValidatorResult): void {
    try {
        throwIfInvalid(validationResult)
    } catch (err) {
        if (err instanceof InvalidSamCliError) {
            // SAM not found.
            // Calling code does not wait for the notification to complete
            void notifySamCliValidation(err)
        }

        // SAM found but version is invalid or failed to parse.
        // code: 'InvalidSamCliVersion'
        throw err
    }
}
