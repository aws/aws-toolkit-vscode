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
    InvalidSamError,
    SamCliInfoResponse,
    SamCliProcessInfo,
    SamCliProcessInvoker,
    SamCliUtils
} from './samCliInvokerUtils'
import { DefaultSamCliLocationProvider } from './samCliLocator'
import {
    DefaultSamCliVersionValidator,
    SamCliVersionValidation,
    SamCliVersionValidator,
    SamCliVersionValidatorResult
} from './samCliVersionValidator'

interface SamCliProcessInvokerContext {
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
        const args = typeof first === 'string' ? [first, ...rest] : rest
        const options: SpawnOptions | undefined = typeof first === 'string' ? undefined : first

        return await this.runCliCommand(this.samCliLocation, options, ...args)
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

export class DefaultValidatingSamCliProcessInvoker extends DefaultSamCliProcessInvoker {

    public constructor(
        context: SamCliProcessInvokerContext = resolveSamCliProcessInvokerContext()
    ) {
        super(resolveSamCliProcessInvokerContext(context))
    }

    public invoke(options: SpawnOptions, ...args: string[]): Promise<ChildProcessResult>
    public invoke(...args: string[]): Promise<ChildProcessResult>
    public async invoke(first: SpawnOptions | string, ...rest: string[]): Promise<ChildProcessResult> {
        const validationResult = await this.getCliValidation(this.samCliLocation)

        if (validationResult.validation !== SamCliVersionValidation.Valid) {
            // prompt will redirect to external URL for updating. We do not need to wait on this.
            // tslint:disable-next-line: no-floating-promises
            this._context.validator.notifyVersionIsNotValid(validationResult)
            const versionErr = new InvalidSamError(validationResult)
            this._context.logger.error(
                versionErr,
                `${validationResult.validation}: version ${validationResult.version}`
            )

            throw versionErr
        }
        const args = typeof first === 'string' ? [first, ...rest] : rest
        // const options: SpawnOptions | undefined = typeof first === 'string' ? undefined : first
        const options: SpawnOptions = typeof first === 'string' ? {} : first

        return super.invoke(options, ...args)
    }

    // todo : cut over to standalone validator
    // todo : note: probably need to deal with notifications here
    private async getCliValidation(samCliLocation: string): Promise<SamCliVersionValidatorResult> {
        const cliStat = await this._context.cliUtils.stat(samCliLocation)
        if ((!this._context.cliInfo.lastModified || cliStat.mtime !== this._context.cliInfo.lastModified)
            || !this._context.cliInfo.info) {
            this._context.cliInfo.info = await this.getInfo(samCliLocation)
            this._context.cliInfo.lastModified = cliStat.mtime
        }

        return await this._context.validator.getCliValidationStatus(this._context.cliInfo.info.version)
    }

    private async getInfo(samCliLocation: string): Promise<SamCliInfoResponse> {
        const logger: Logger = getLogger()

        const { error, exitCode, stderr, stdout }: ChildProcessResult =
            await this.runCliCommand(samCliLocation, undefined, '--info')

        if (exitCode === 0) {
            const response = this.convertOutput(stdout)
            if (!!response) {
                return response
            }

            throw new Error('SAM CLI did not return expected data')
        }
        const err = new Error(
            `sam --info encountered an error: ${error}
    ${error && error.message ? 'message: ' + error.message : ''}
    stderr : ${stderr}
    stdout : ${stdout}`
        )
        logger.error(err)
        throw err
    }

    /**
     * Parses the output into a typed object with expected data
     * @param text output from a `sam --info` call
     */
    private convertOutput(text: string): SamCliInfoResponse | undefined {
        const logger: Logger = getLogger()
        try {
            return JSON.parse(text) as SamCliInfoResponse
        } catch (err) {
            logger.error(err as Error)

            return undefined
        }
    }
}
