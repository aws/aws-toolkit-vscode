/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { SpawnOptions } from 'child_process'
import { Stats } from 'fs'
import { stat } from '../../filesystem'
import { ChildProcessResult } from '../../utilities/childProcess'
import { SamCliVersionValidatorResult } from './samCliVersionValidator'

export interface SamCliProcessInvoker {
    invoke(options: SpawnOptions, ...args: string[]): Promise<ChildProcessResult>
    invoke(...args: string[]): Promise<ChildProcessResult>
}

export interface SamCliUtils {
    stat(samCliLocation: string): Promise<Stats>
}

export class DefaultSamCliUtils {
    public async stat(samCliLocation: string): Promise<Stats> {
        return await stat(samCliLocation)
    }
}

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
