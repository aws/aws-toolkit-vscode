/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { SamCliSettings } from './samCliSettings'
import { DefaultSamCliProcessInvoker } from './samCliInvoker'
import { SamCliProcessInvoker } from './samCliInvokerUtils'
import { throwAndNotifyIfInvalid } from './samCliValidationUtils'
import { DefaultSamCliValidator, DefaultSamCliValidatorContext, SamCliValidator } from './samCliValidator'

export interface SamCliContext {
    validator: SamCliValidator
    invoker: SamCliProcessInvoker
}

// Sam Cli Context is lazy loaded on first request to reduce the
// amount of work done during extension activation.
let samCliContext: SamCliContext | undefined

/**
 * Sam Cli Context is lazy loaded on first request
 */
export function getSamCliContext() {
    return (samCliContext ??= makeSamCliContext())
}

export async function getSamCliVersion(context: SamCliContext): Promise<string> {
    const result = await context.validator.detectValidSamCli()
    throwAndNotifyIfInvalid(result)

    return result.versionValidation!.version!
}

function makeSamCliContext(): SamCliContext {
    const samCliConfiguration = SamCliSettings.instance
    const invoker = new DefaultSamCliProcessInvoker(samCliConfiguration)

    const validatorContext = new DefaultSamCliValidatorContext(samCliConfiguration)
    const validator = new DefaultSamCliValidator(validatorContext)

    const context: SamCliContext = {
        invoker,
        validator,
    }

    return context
}
