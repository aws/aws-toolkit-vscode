/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { stat } from 'fs-extra'
import * as semver from 'semver'
import { ClassToInterfaceType } from '../../utilities/tsUtils'
import { SamCliSettings } from './samCliSettings'
import { SamCliInfoInvocation, SamCliInfoResponse } from './samCliInfo'
import { ToolkitError } from '../../errors'

export const minSamCliVersion = '0.47.0'
export const minSamCliVersionForImageSupport = '1.13.0'
export const maxSamCliVersionExclusive = '2.0.0'
export const minSamCliVersionForGoSupport = '1.18.1'
export const minSamCliVersionForArmSupport = '1.33.0'
export const minSamCliVersionForDotnet31Support = '1.4.0'

// Errors
export class InvalidSamCliError extends ToolkitError {}

export class SamCliNotFoundError extends InvalidSamCliError {
    public constructor() {
        super('SAM CLI was not found', { code: 'MissingSamCli' })
    }
}

export class InvalidSamCliVersionError extends InvalidSamCliError {
    public constructor(public versionValidation: SamCliVersionValidatorResult) {
        super('SAM CLI has an invalid version', { code: 'InvalidSamCliVersion' })
    }
}

// Validation
export enum SamCliVersionValidation {
    Valid = 'Valid',
    VersionTooLow = 'VersionTooLow',
    VersionTooHigh = 'VersionTooHigh',
    VersionNotParseable = 'VersionNotParseable',
}

export type SamCliVersionValidatorResult =
    | {
          readonly validation: Exclude<SamCliVersionValidation, SamCliVersionValidation.VersionNotParseable>
          readonly version: string
      }
    | {
          readonly validation: SamCliVersionValidation.VersionNotParseable
          readonly version?: string | undefined
      }

export interface SamCliValidatorResult {
    samCliFound: boolean
    versionValidation?: SamCliVersionValidatorResult
}

export interface SamCliValidator {
    detectValidSamCli(): Promise<SamCliValidatorResult>
    getVersionValidatorResult(): Promise<SamCliVersionValidatorResult>
}

export type SamCliValidatorContext = ClassToInterfaceType<DefaultSamCliValidatorContext>

export class DefaultSamCliValidator implements SamCliValidator {
    private cachedSamInfoResponse?: SamCliInfoResponse
    private cachedSamCliVersionId?: string

    public constructor(private readonly context: SamCliValidatorContext) {}

    public async detectValidSamCli(): Promise<SamCliValidatorResult> {
        const result: SamCliValidatorResult = {
            samCliFound: false,
        }

        const sam = await this.context.samCliLocation()
        if (sam) {
            result.samCliFound = true
            result.versionValidation = await this.getVersionValidatorResult()
        }

        return result
    }

    public async getVersionValidatorResult(): Promise<SamCliVersionValidatorResult> {
        const samCliId: string = await this.context.getSamCliExecutableId()
        if (!this.isSamCliVersionCached(samCliId)) {
            this.cachedSamInfoResponse = await this.context.getSamCliInfo()
            this.cachedSamCliVersionId = samCliId
        }

        const version = this.cachedSamInfoResponse!.version

        return {
            version,
            validation: DefaultSamCliValidator.validateSamCliVersion(version),
        }
    }

    private isSamCliVersionCached(samCliVersionId: string): boolean {
        if (!this.cachedSamInfoResponse) {
            return false
        }
        if (!this.cachedSamCliVersionId) {
            return false
        }

        return this.cachedSamCliVersionId === samCliVersionId
    }

    public static validateSamCliVersion(version?: string): SamCliVersionValidation {
        if (!version) {
            return SamCliVersionValidation.VersionNotParseable
        }

        if (!semver.valid(version)) {
            return SamCliVersionValidation.VersionNotParseable
        }

        if (semver.lt(version, minSamCliVersion)) {
            return SamCliVersionValidation.VersionTooLow
        }

        if (semver.gte(version, maxSamCliVersionExclusive)) {
            return SamCliVersionValidation.VersionTooHigh
        }

        return SamCliVersionValidation.Valid
    }
}

export class DefaultSamCliValidatorContext implements SamCliValidatorContext {
    public constructor(private readonly config: SamCliSettings) {}

    public async samCliLocation(): Promise<string | undefined> {
        return (await this.config.getOrDetectSamCli()).path
    }

    public async getSamCliExecutableId(): Promise<string> {
        // Function should never get called if there is no SAM CLI
        const location = await this.samCliLocation()
        if (!location) {
            throw new Error('SAM CLI does not exist')
        }

        // The modification timestamp of SAM CLI is used as the "distinct executable id"
        const stats = await stat(location)

        return stats.mtime.valueOf().toString()
    }

    public async getSamCliInfo(): Promise<SamCliInfoResponse> {
        const samPath = await this.samCliLocation()
        if (!samPath) {
            throw new Error('Unable to get SAM CLI info without an executable path')
        }
        const samCliInfo = new SamCliInfoInvocation(samPath)

        return await samCliInfo.execute()
    }
}
