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
import { throwAndNotifyIfInvalid } from './samCliValidationUtils'
import {
    DefaultSamCliValidator,
    DefaultSamCliValidatorContext,
    SamCliValidator,
    SamCliValidatorResult,
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
            new DefaultSamCliValidatorContext(
                this.invokerContext.cliConfig,
                new DefaultSamCliProcessInvoker(this.invokerContext),
            )
        )
    }

    public invoke(options: SpawnOptions, ...args: string[]): Promise<ChildProcessResult>
    public invoke(...args: string[]): Promise<ChildProcessResult>
    public async invoke(first: SpawnOptions | string, ...rest: string[]): Promise<ChildProcessResult> {
        await this.validateSamCli()

        const args = typeof first === 'string' ? [first, ...rest] : rest
        const options: SpawnOptions = typeof first === 'string' ? {} : first

        return await this.invoker.invoke(options, ...args)
    }

    private async validateSamCli(): Promise<void> {
        const validationResult: SamCliValidatorResult = await this.validator.detectValidSamCli()

        // TODO : Showing dialog here is temporary until https://github.com/aws/aws-toolkit-vscode/issues/527
        // TODO : is complete. The dialog will be raised earlier than this point, leaving this to throw Errors.
        throwAndNotifyIfInvalid(validationResult)
    }
}
