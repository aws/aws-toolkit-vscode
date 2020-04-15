/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { stat } from 'fs-extra'
import * as semver from 'semver'
import { SamCliConfiguration } from './samCliConfiguration'
import { SamCliInfoInvocation, SamCliInfoResponse } from './samCliInfo'
import { SamCliProcessInvoker } from './samCliInvokerUtils'

export const MINIMUM_SAM_CLI_VERSION_INCLUSIVE = '0.38.0'
export const MAXIMUM_SAM_CLI_VERSION_EXCLUSIVE = '0.60.0'

// Errors
export class InvalidSamCliError extends Error {
    public constructor(message?: string | undefined) {
        super(message)
    }
}

export class SamCliNotFoundError extends InvalidSamCliError {
    public constructor() {
        super('SAM CLI was not found')
    }
}

export class InvalidSamCliVersionError extends InvalidSamCliError {
    public constructor(public versionValidation: SamCliVersionValidatorResult) {
        super('SAM CLI has an invalid version')
    }
}

// Validation
export enum SamCliVersionValidation {
    Valid = 'Valid',
    VersionTooLow = 'VersionTooLow',
    VersionTooHigh = 'VersionTooHigh',
    VersionNotParseable = 'VersionNotParseable',
}

export interface SamCliVersionValidatorResult {
    version?: string
    validation: SamCliVersionValidation
}

export interface SamCliValidatorResult {
    samCliFound: boolean
    versionValidation?: SamCliVersionValidatorResult
}

export interface SamCliValidator {
    detectValidSamCli(): Promise<SamCliValidatorResult>
}

export interface SamCliValidatorContext {
    samCliLocation: string | undefined
    getSamCliExecutableId(): Promise<string>
    getSamCliInfo(): Promise<SamCliInfoResponse>
}

export class DefaultSamCliValidator implements SamCliValidator {
    private cachedSamInfoResponse?: SamCliInfoResponse
    private cachedSamCliVersionId?: string

    public constructor(private readonly context: SamCliValidatorContext) {}

    public async detectValidSamCli(): Promise<SamCliValidatorResult> {
        const result: SamCliValidatorResult = {
            samCliFound: false,
        }

        const samCliLocation = this.context.samCliLocation
        if (samCliLocation) {
            result.samCliFound = true

            result.versionValidation = await this.getVersionValidatorResult()
        }

        return result
    }

    // This method is public for testing purposes
    public async getVersionValidatorResult(): Promise<SamCliVersionValidatorResult> {
        const samCliId: string = await this.context.getSamCliExecutableId()
        if (!this.isSamCliVersionCached(samCliId)) {
            this.cachedSamInfoResponse = await this.context.getSamCliInfo()
            this.cachedSamCliVersionId = samCliId
        }

        const version: string = this.cachedSamInfoResponse!.version

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

        if (semver.lt(version, MINIMUM_SAM_CLI_VERSION_INCLUSIVE)) {
            return SamCliVersionValidation.VersionTooLow
        }

        if (semver.gte(version, MAXIMUM_SAM_CLI_VERSION_EXCLUSIVE)) {
            return SamCliVersionValidation.VersionTooHigh
        }

        return SamCliVersionValidation.Valid
    }
}

export class DefaultSamCliValidatorContext implements SamCliValidatorContext {
    public constructor(
        private readonly samCliConfiguration: SamCliConfiguration,
        private readonly invoker: SamCliProcessInvoker
    ) {}

    public get samCliLocation(): string | undefined {
        return this.samCliConfiguration.getSamCliLocation()
    }

    public async getSamCliExecutableId(): Promise<string> {
        // Function should never get called if there is no SAM CLI
        if (!this.samCliLocation) {
            throw new Error('SAM CLI does not exist')
        }

        // The modification timestamp of SAM CLI is used as the "distinct executable id"
        const stats = await stat(this.samCliLocation)

        return stats.mtime.valueOf().toString()
    }

    public async getSamCliInfo(): Promise<SamCliInfoResponse> {
        const samCliInfo = new SamCliInfoInvocation(this.invoker)

        return await samCliInfo.execute()
    }
}
