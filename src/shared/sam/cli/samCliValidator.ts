/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { Stats } from 'fs'
import { stat } from '../../filesystem'
import { SamCliConfiguration } from './samCliConfiguration'
import { SamCliInfoInvocation, SamCliInfoResponse } from './samCliInfo'
import { SamCliVersionValidatorResult, validateSamCliVersion } from './samCliVersionValidator'

export interface SamCliProcessInfo {
    info?: SamCliInfoResponse
    lastModified?: Date
}

export interface SamCliValidator {
    detectValidSamCli(): Promise<SamCliValidatorResult>
}

export interface SamCliValidatorResult {
    samCliFound: boolean
    versionValidation?: SamCliVersionValidatorResult
}

export abstract class BaseSamCliValidator implements SamCliValidator {
    // todo : eliminate SamCliProcessInfo?
    private readonly samCliProcessInfo: SamCliProcessInfo = {}

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

    // public for testing
    public async getVersionValidatorResult(samCliLocation: string): Promise<SamCliVersionValidatorResult> {
        const cliStat: Pick<Stats, 'mtime'> = await this.getSamCliStat(samCliLocation)
        if (!this.isSamCliVersionCached(cliStat.mtime)) {
            this.samCliProcessInfo.info = await this.getInfo(samCliLocation)
            this.samCliProcessInfo.lastModified = cliStat.mtime
        }

        const version: string = this.samCliProcessInfo.info!.version

        return {
            version,
            validation: validateSamCliVersion(version),
        }
    }

    protected abstract async getSamCliStat(samCliLocation: string): Promise<Pick<Stats, 'mtime'>>

    protected abstract getSamCliLocation(): string | undefined

    protected abstract async getInfo(samCliLocation: string): Promise<SamCliInfoResponse>

    // todo : could be public to unit test?
    private isSamCliVersionCached(samCliLastModifiedOn: Date): boolean {
        if (!this.samCliProcessInfo.info) { return false }
        if (!this.samCliProcessInfo.lastModified) { return false }

        return this.samCliProcessInfo.lastModified === samCliLastModifiedOn
    }
}

export class DefaultSamCliValidator extends BaseSamCliValidator {

    // todo : sam cli configuration - what if we pass in the location instead?
    public constructor(private readonly samCliConfiguration: SamCliConfiguration) {
        super()
    }

    protected async getSamCliStat(samCliLocation: string): Promise<Stats> {
        return stat(samCliLocation)
    }

    protected getSamCliLocation(): string | undefined {
        return this.samCliConfiguration.getSamCliLocation()
    }

    protected async getInfo(samCliLocation: string): Promise<SamCliInfoResponse> {
        // todo : invoker?
        const x = new SamCliInfoInvocation()

        return await x.execute()
    }
}
