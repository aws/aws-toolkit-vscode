/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import {
    DefaultSamCliProcessInvoker,
    resolveSamCliProcessInvokerContext,
    SamCliProcessInvokerContext
} from './samCliInvoker'
import { InvalidSamCliVersionError, SamCliNotFoundError } from './samCliInvokerUtils'
import { DefaultSamCliValidator, SamCliValidator } from './samCliValidator'
import { SamCliVersionValidation } from './samCliVersionValidator'

/**
 * Validates the SAM CLI version before making calls to the SAM CLI.
 */
export class DefaultValidatingSamCliProcessInvoker extends DefaultSamCliProcessInvoker {

    public constructor(
        context: SamCliProcessInvokerContext = resolveSamCliProcessInvokerContext(),
        private readonly samCliValidator: SamCliValidator = new DefaultSamCliValidator(
            context.cliConfig,
            new DefaultSamCliProcessInvoker(context),
        ),
    ) {
        super(resolveSamCliProcessInvokerContext(context))
    }

    protected async validate(): Promise<void> {
        await this.validateSamCli()
        await super.validate()
    }

    private async validateSamCli(): Promise<void> {
        const validationResult = await this.samCliValidator.detectValidSamCli()

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
}
