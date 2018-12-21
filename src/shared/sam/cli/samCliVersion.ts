/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as semver from 'semver'
import { SamCliInfoResponse, SamInfoCliCommand } from './samCliCommand'
import { SamCliProcess } from './samCliProcess'

export enum SamCliVersionValidation {
    Valid,
    VersionTooLow,
    VersionTooHigh,
    VersionNotParseable,
}

export class SamCliVersion {

    public static readonly MINIMUM_SAM_CLI_VERSION_INCLUSIVE = '0.7.0'
    public static readonly MAXIMUM_SAM_CLI_VERSION_EXCLUSIVE = '0.11.0'

    public static validate(version?: string): SamCliVersionValidation {
        if (!version) {
            return SamCliVersionValidation.VersionNotParseable
        }

        if (!semver.valid(version)) {
            return SamCliVersionValidation.VersionNotParseable
        }

        if (semver.lt(version, this.MINIMUM_SAM_CLI_VERSION_INCLUSIVE)) {
            return SamCliVersionValidation.VersionTooLow
        }

        if (semver.gte(version, this.MAXIMUM_SAM_CLI_VERSION_EXCLUSIVE)) {
            return SamCliVersionValidation.VersionTooHigh
        }

        return SamCliVersionValidation.Valid
    }

}

export interface SamCliVersionProvider {
    getSamCliVersion(): Promise<string | undefined>
}

export class DefaultSamCliVersionProvider implements SamCliVersionProvider {
    public async getSamCliVersion(): Promise<string | undefined> {
        const process: SamCliProcess = new SamInfoCliCommand().asSamCliProcess()
        process.start()

        const samInfoResults = await process.promise()

        if (samInfoResults.exitCode !== 0) {
            console.log('SAM CLI info failure', samInfoResults)

            // tslint:disable-next-line:max-line-length
            throw new Error(`SAM CLI info call failed with error code ${samInfoResults.exitCode} and stderr ${samInfoResults.stderr}`)
        }

        const samCliInfoResponse: SamCliInfoResponse | undefined =
            SamInfoCliCommand.convertOutput(samInfoResults.stdout)

        if (!!samCliInfoResponse) {
            return samCliInfoResponse.version
        }

        return undefined
    }
}
