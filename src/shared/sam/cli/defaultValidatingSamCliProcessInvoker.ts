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
import { notifySamCliValidation } from './samCliValidationNotification'
import {
    DefaultSamCliValidator,
    InvalidSamCliError,
    InvalidSamCliVersionError,
    SamCliNotFoundError, SamCliValidator,
    SamCliVersionValidation
} from './samCliValidator'

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
        try {
            await this.validateSamCli()
            await super.validate()
        } catch (err) {
            if (err instanceof InvalidSamCliError) {
                // TODO : Showing dialog here is temporary until LINK_ISSUE is complete.
                // Don't wait for the dialog to be acted on. Reacting code is self-contained, and
                // there is no downstream code that depends on it.
                // tslint:disable-next-line:no-floating-promises
                notifySamCliValidation(err)
            }

            throw err
        }
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
