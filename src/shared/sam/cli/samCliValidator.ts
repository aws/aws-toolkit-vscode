/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

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
    Version185Win = 'Version185Win',
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
        const r = await this.context.getSamCliInfo()
        return {
            version: r.version,
            validation: DefaultSamCliValidator.validateSamCliVersion(r.version),
        }
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

        if (process.platform === 'win32' && semver.gte(version, '1.85.0') && semver.lte(version, '1.86.0')) {
            return SamCliVersionValidation.Version185Win
        }

        return SamCliVersionValidation.Valid
    }
}

export class DefaultSamCliValidatorContext implements SamCliValidatorContext {
    public constructor(private readonly config: SamCliSettings) {}

    public async samCliLocation(): Promise<string | undefined> {
        return (await this.config.getOrDetectSamCli()).path
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
