/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { Stats } from 'fs'
import { stat } from '../../filesystem'
import { SamCliConfiguration } from './samCliConfiguration'
import { SamCliInfoInvocation, SamCliInfoResponse } from './samCliInfo'
import { SamCliProcessInvoker } from './samCliInvokerUtils'
import { SamCliVersionValidatorResult, validateSamCliVersion } from './samCliVersionValidator'

export interface SamCliValidator {
    detectValidSamCli(): Promise<SamCliValidatorResult>
}

export interface SamCliValidatorResult {
    samCliFound: boolean
    versionValidation?: SamCliVersionValidatorResult
}

export abstract class BaseSamCliValidator implements SamCliValidator {
    private cachedSamInfoResponse?: SamCliInfoResponse
    // The modification timestamp of SAM CLI is used as the "cache key"
    private cachedSamInfoResponseSource?: Date

    public constructor() {
    }

    public async detectValidSamCli(): Promise<SamCliValidatorResult> {
        const result: SamCliValidatorResult = {
            samCliFound: false
        }

        const samCliLocation = this.getSamCliLocation()
        if (samCliLocation) {
            result.samCliFound = true

            result.versionValidation = await this.getVersionValidatorResult(samCliLocation)
        }

        return result
    }

    // This method is public for testing purposes
    public async getVersionValidatorResult(samCliLocation: string): Promise<SamCliVersionValidatorResult> {
        const cliStat: Pick<Stats, 'mtime'> = await this.getSamCliStat(samCliLocation)
        if (!this.isSamCliVersionCached(cliStat.mtime)) {
            this.cachedSamInfoResponse = await this.getInfo(samCliLocation)
            this.cachedSamInfoResponseSource = cliStat.mtime
        }

        const version: string = this.cachedSamInfoResponse!.version

        return {
            version,
            validation: validateSamCliVersion(version),
        }
    }

    protected abstract async getSamCliStat(samCliLocation: string): Promise<Pick<Stats, 'mtime'>>

    protected abstract getSamCliLocation(): string | undefined

    protected abstract async getInfo(samCliLocation: string): Promise<SamCliInfoResponse>

    private isSamCliVersionCached(samCliLastModifiedOn: Date): boolean {
        if (!this.cachedSamInfoResponse) { return false }
        if (!this.cachedSamInfoResponseSource) { return false }

        return this.cachedSamInfoResponseSource === samCliLastModifiedOn
    }
}

export class DefaultSamCliValidator extends BaseSamCliValidator {

    public constructor(
        private readonly samCliConfiguration: SamCliConfiguration,
        private readonly invoker: SamCliProcessInvoker
    ) {
        super()
    }

    protected async getSamCliStat(samCliLocation: string): Promise<Stats> {
        return stat(samCliLocation)
    }

    protected getSamCliLocation(): string | undefined {
        return this.samCliConfiguration.getSamCliLocation()
    }

    protected async getInfo(samCliLocation: string): Promise<SamCliInfoResponse> {
        const samCliInfo = new SamCliInfoInvocation(this.invoker)

        return await samCliInfo.execute()
    }
}
