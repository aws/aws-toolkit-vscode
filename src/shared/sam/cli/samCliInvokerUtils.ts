/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { SpawnOptions } from 'child_process'
import { Stats } from 'fs'
import * as vscode from 'vscode'
import { stat } from '../../filesystem'
import { ChildProcessResult } from '../../utilities/childProcess'
import { SamCliVersionValidatorResult } from './samCliVersionValidator'

/**
 * Maps out the response text from the sam cli command `sam --info`
 */
export interface SamCliInfoResponse {
    version: string
}

export interface SamCliProcessInvoker {
    invoke(options: SpawnOptions, ...args: string[]): Promise<ChildProcessResult>
    invoke(...args: string[]): Promise<ChildProcessResult>
}

export interface SamCliTaskInvoker {
    invoke(task: vscode.Task): Promise<vscode.TaskExecution>
}

export interface SamCliProcessInfo {
    info?: SamCliInfoResponse
    lastModified?: Date
}

export interface SamCliUtils {
    stat(samCliLocation: string): Promise<Stats>
}

export class DefaultSamCliUtils {
    public async stat(samCliLocation: string): Promise<Stats> {
        return await stat(samCliLocation)
    }
}

export class InvalidSamError extends Error {
    public constructor (public versionValidation: SamCliVersionValidatorResult) {
        super()
    }
}
