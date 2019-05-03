/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { SpawnOptions } from 'child_process'
import { extensionSettingsPrefix } from '../../constants'
import { getLogger, Logger } from '../../logger'
import { DefaultSettingsConfiguration } from '../../settingsConfiguration'
import { ChildProcess, ChildProcessResult } from '../../utilities/childProcess'
import { DefaultSamCliConfiguration, SamCliConfiguration } from './samCliConfiguration'
import {
    DefaultSamCliUtils,
    SamCliProcessInfo,
    SamCliProcessInvoker,
    SamCliUtils
} from './samCliInvokerUtils'
import { DefaultSamCliLocationProvider } from './samCliLocator'
import {
    DefaultSamCliVersionValidator,
    SamCliVersionValidator,
} from './samCliVersionValidator'

export interface SamCliProcessInvokerContext {
    cliConfig: SamCliConfiguration
    cliInfo: SamCliProcessInfo
    cliUtils: SamCliUtils
    logger: Logger
    validator: SamCliVersionValidator
}

export class DefaultSamCliProcessInvokerContext implements SamCliProcessInvokerContext {
    public cliConfig: SamCliConfiguration = new DefaultSamCliConfiguration(
        new DefaultSettingsConfiguration(extensionSettingsPrefix),
        new DefaultSamCliLocationProvider()
    )
    public cliInfo: SamCliProcessInfo = { info: undefined, lastModified: undefined }
    public cliUtils: SamCliUtils = new DefaultSamCliUtils()
    public logger: Logger = getLogger()
    public validator: SamCliVersionValidator = new DefaultSamCliVersionValidator()
}

export function resolveSamCliProcessInvokerContext(
    params: Partial<SamCliProcessInvokerContext> = {}
): SamCliProcessInvokerContext {
    const defaults = new DefaultSamCliProcessInvokerContext()

    return {
        cliConfig: params.cliConfig || defaults.cliConfig,
        cliInfo: params.cliInfo || defaults.cliInfo,
        cliUtils: params.cliUtils || defaults.cliUtils,
        logger: params.logger || defaults.logger,
        validator: params.validator || defaults.validator,
    }
}

// todo : CC : toolkit code that currently calls this no longer has validation
export class DefaultSamCliProcessInvoker implements SamCliProcessInvoker {

    public constructor(
        protected readonly _context: SamCliProcessInvokerContext = resolveSamCliProcessInvokerContext()
    ) { }

    public invoke(options: SpawnOptions, ...args: string[]): Promise<ChildProcessResult>
    public invoke(...args: string[]): Promise<ChildProcessResult>
    public async invoke(first: SpawnOptions | string, ...rest: string[]): Promise<ChildProcessResult> {
        await this.validate()

        const args = typeof first === 'string' ? [first, ...rest] : rest
        const options: SpawnOptions | undefined = typeof first === 'string' ? undefined : first

        return await this.runCliCommand(this.samCliLocation, options, ...args)
    }

    /**
     * Overridable method that throws Errors when validations fail.
     */
    protected async validate(): Promise<void> {
    }

    // Gets SAM CLI Location, throws if not found
    protected get samCliLocation(): string {
        const samCliLocation: string | undefined = this._context.cliConfig.getSamCliLocation()
        if (!samCliLocation) {
            const err = new Error('SAM CLI location not configured')
            this._context.logger.error(err)
            throw err
        }

        return samCliLocation
    }

    protected async runCliCommand(
        samCliLocation: string,
        options?: SpawnOptions,
        ...args: string[]
    ): Promise<ChildProcessResult> {
        const childProcess: ChildProcess = new ChildProcess(samCliLocation, options, ...args)

        return await childProcess.run()
    }
}
