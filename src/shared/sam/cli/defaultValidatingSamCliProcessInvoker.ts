/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { SpawnOptions } from 'child_process'
import { ChildProcessResult } from '../../utilities/childProcess'
import {
    DefaultSamCliProcessInvoker,
    resolveSamCliProcessInvokerContext,
    SamCliProcessInvokerContext
} from './samCliInvoker'
import { SamCliProcessInvoker } from './samCliInvokerUtils'
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
export class DefaultValidatingSamCliProcessInvoker implements SamCliProcessInvoker {

    private readonly invoker: SamCliProcessInvoker
    private readonly invokerContext: SamCliProcessInvokerContext
    private readonly validator: SamCliValidator

    public constructor(params: {
        invoker?: SamCliProcessInvoker,
        invokerContext?: SamCliProcessInvokerContext,
        validator?: SamCliValidator,
    }) {
        this.invokerContext = resolveSamCliProcessInvokerContext(params.invokerContext)
        this.invoker = params.invoker || new DefaultSamCliProcessInvoker(this.invokerContext)

        // Regardless of the sam cli invoker provided, the default validator will always use the standard invoker
        this.validator = params.validator || new DefaultSamCliValidator(
            this.invokerContext.cliConfig,
            new DefaultSamCliProcessInvoker(this.invokerContext),
        )
    }

    public invoke(options: SpawnOptions, ...args: string[]): Promise<ChildProcessResult>
    public invoke(...args: string[]): Promise<ChildProcessResult>
    public async invoke(first: SpawnOptions | string, ...rest: string[]): Promise<ChildProcessResult> {
        await this.validate()

        const args = typeof first === 'string' ? [first, ...rest] : rest
        const options: SpawnOptions = typeof first === 'string' ? {} : first

        return await this.invoker.invoke(options, ...args)
    }

    private async validate(): Promise<void> {
        try {
            await this.validateSamCli()
        } catch (err) {
            if (err instanceof InvalidSamCliError) {
                // TODO : Showing dialog here is temporary until https://github.com/aws/aws-toolkit-vscode/issues/526
                // TODO : is complete. The dialog will be raised earlier than this point, leaving this to throw Errors.
                // Don't wait for the dialog to be acted on. Reacting code is self-contained, and
                // there is no downstream code that depends on it.
                // tslint:disable-next-line:no-floating-promises
                notifySamCliValidation(err)
            }

            throw err
        }
    }

    private async validateSamCli(): Promise<void> {
        const validationResult = await this.validator.detectValidSamCli()

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
