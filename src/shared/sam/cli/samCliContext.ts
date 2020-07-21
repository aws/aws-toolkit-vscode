/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as semver from 'semver'
import { SettingsConfiguration } from '../../settingsConfiguration'
import { DefaultSamCliConfiguration } from './samCliConfiguration'
import { DefaultSamCliProcessInvoker, SamCliProcessInvokerContext } from './samCliInvoker'
import { SamCliProcessInvoker } from './samCliInvokerUtils'
import { DefaultSamCliLocationProvider } from './samCliLocator'
import { throwAndNotifyIfInvalid } from './samCliValidationUtils'
import { DefaultSamCliValidator, DefaultSamCliValidatorContext, SamCliValidator } from './samCliValidator'
import { getLogger } from '../../logger'

export interface SamCliContext {
    validator: SamCliValidator
    invoker: SamCliProcessInvoker
}

// Sam Cli Context is lazy loaded on first request to reduce the
// amount of work done during extension activation.
let samCliContext: SamCliContext | undefined
let samCliContextInitialized: boolean = false

// Components required to load Sam Cli Context
let settingsConfiguration: SettingsConfiguration

export function initialize(params: { settingsConfiguration: SettingsConfiguration }) {
    settingsConfiguration = params.settingsConfiguration

    samCliContext = undefined
    samCliContextInitialized = true
}

/**
 * Sam Cli Context is lazy loaded on first request
 */
export function getSamCliContext() {
    if (!samCliContextInitialized) {
        throw new Error('SamCliContext not initialized! initialize() must be called prior to use.')
    }

    if (!samCliContext) {
        samCliContext = makeSamCliContext()
    }

    return samCliContext
}

export async function getSamCliVersion(context: SamCliContext): Promise<string> {
    const result = await context.validator.detectValidSamCli()
    throwAndNotifyIfInvalid(result)

    return result.versionValidation!.version!
}

/**
 * Returns the correct Docker image name based on SAM CLI version.
 * Anything not greater than 1.0.0, undefined, or non-parseable will use `amazon/aws-sam-cli-emulation-image-${lambdaRuntime}`
 * Else, use `lambci/lambda:${lambdaRuntime}`
 * @param samCliVersion Version to evaluate
 * @param lambdaRuntime Runtime name to append to Docker image
 */
export function getSamCliDockerImageName(samCliVersion: string | undefined, lambdaRuntime: string): string {
    const amazonImage = `amazon/aws-sam-cli-emulation-image-${lambdaRuntime}`
    const legacyImage = `lambci/lambda:${lambdaRuntime}`
    try {
        return !samCliVersion || semver.gte(samCliVersion, '1.0.0') ? amazonImage : legacyImage
    } catch (e) {
        const err = e as Error
        getLogger().error('Could not parse SAM CLI version:', samCliVersion, err.message)

        return amazonImage
    }
}

function makeSamCliContext(): SamCliContext {
    const samCliConfiguration = new DefaultSamCliConfiguration(
        settingsConfiguration,
        new DefaultSamCliLocationProvider()
    )

    const invokerContext: SamCliProcessInvokerContext = {
        cliConfig: samCliConfiguration,
    }
    const invoker = new DefaultSamCliProcessInvoker(invokerContext)

    const validatorContext = new DefaultSamCliValidatorContext(samCliConfiguration, invoker)
    const validator = new DefaultSamCliValidator(validatorContext)

    const context: SamCliContext = {
        invoker,
        validator,
    }

    return context
}
