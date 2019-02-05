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
    public async invoke(optionsOrArgs: any, ...args: string[]): Promise<ChildProcessResult> {
        let options: SpawnOptions | undefined
        if (Array.isArray(optionsOrArgs)) {
            args = optionsOrArgs as string[]
        } else if (typeof optionsOrArgs === 'string' || optionsOrArgs instanceof String) {
            args = [optionsOrArgs.toString(), ...args]
        } else {
            options = optionsOrArgs as SpawnOptions
        }

        const samCliLocation = this.config.getSamCliLocation()
        if (!samCliLocation) {
            throw new Error('SAM CLI location not configured')
        }

        const childProcess: ChildProcess = new ChildProcess(samCliLocation, options, ...args)
        childProcess.start()

        return await childProcess.promise()
    }
}

export class DefaultSamCliTaskInvoker implements SamCliTaskInvoker {
    public async invoke(task: vscode.Task): Promise<vscode.TaskExecution> {
        return await vscode.tasks.executeTask(task)
    }
}
