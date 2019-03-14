/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { SpawnOptions } from 'child_process'
import * as vscode from 'vscode'
import { extensionSettingsPrefix } from '../../constants'
import { DefaultSettingsConfiguration } from '../../settingsConfiguration'
import { ChildProcess, ChildProcessResult } from '../../utilities/childProcess'
import { DefaultSamCliConfiguration, SamCliConfiguration } from './samCliConfiguration'
import { DefaultSamCliLocationProvider } from './samCliLocator'
import { SamCliVersionValidation } from './samCliVersion'

export interface SamCliProcessInvoker {
    invoke(options: SpawnOptions, ...args: string[]): Promise<ChildProcessResult>
    invoke(...args: string[]): Promise<ChildProcessResult>
}

export interface SamCliTaskInvoker {
    invoke(task: vscode.Task): Promise<vscode.TaskExecution>
}

export class DefaultSamCliProcessInvoker implements SamCliProcessInvoker {
    public constructor(private readonly config: SamCliConfiguration = new DefaultSamCliConfiguration(
        new DefaultSettingsConfiguration(extensionSettingsPrefix),
        new DefaultSamCliLocationProvider()
    )) {
    }

    public invoke(options: SpawnOptions, ...args: string[]): Promise<ChildProcessResult>
    public invoke(...args: string[]): Promise<ChildProcessResult>
    public async invoke(first: SpawnOptions | string, ...rest: string[]): Promise<ChildProcessResult> {
        const validationResult = await this.config.validator.validate()

        if (validationResult.validation === SamCliVersionValidation.Valid) {
            const args = typeof first === 'string' ? [ first, ...rest ] : rest
            const options: SpawnOptions | undefined = typeof first === 'string' ? undefined : first

            const samCliLocation = this.config.getSamCliLocation()
            if (!samCliLocation) {
                throw new Error('SAM CLI location not configured')
            }

            const childProcess: ChildProcess = new ChildProcess(samCliLocation, options, ...args)

            return await childProcess.run()
        }

        const errorResult: ChildProcessResult = {
            exitCode: 1,
            stdout: '',
            stderr: '',
            error: undefined
        }
        switch (validationResult.validation) {
            case SamCliVersionValidation.VersionTooHigh:
                const samVersionTooHighMessage = 'AWS Toolkit is out of date'
                errorResult.error = new Error(samVersionTooHighMessage)
                errorResult.stdout = samVersionTooHighMessage
                errorResult.stderr = samVersionTooHighMessage
                break
            case SamCliVersionValidation.VersionTooLow:
            case SamCliVersionValidation.VersionNotParseable:
                const samVersionTooLowMessage = 'SAM CLI is out of date'
                errorResult.error = new Error(samVersionTooLowMessage)
                errorResult.stdout = samVersionTooLowMessage
                errorResult.stderr = samVersionTooLowMessage
                break
        }
        this.config.validator.notifyVersionIsNotValid(validationResult)

        return errorResult
    }
}

export class DefaultSamCliTaskInvoker implements SamCliTaskInvoker {
    public async invoke(task: vscode.Task): Promise<vscode.TaskExecution> {
        return await vscode.tasks.executeTask(task)
    }
}
