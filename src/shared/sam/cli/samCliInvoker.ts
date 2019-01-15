/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { extensionSettingsPrefix } from '../../constants'
import { ext } from '../../extensionGlobals'
import { DefaultSettingsConfiguration } from '../../settingsConfiguration'
import { ChildProcess, ChildProcessResult } from '../../utilities/childProcess'
import { types as vscode } from '../../vscode'
import { DefaultSamCliConfiguration, SamCliConfiguration } from './samCliConfiguration'
import { DefaultSamCliLocationProvider } from './samCliLocator'

export interface SamCliProcessInvoker {
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

    public async invoke(...args: string[]): Promise<ChildProcessResult> {
        const samCliLocation = this.config.getSamCliLocation()
        if (!samCliLocation) {
            throw new Error('SAM CLI location not configured')
        }

        const childProcess: ChildProcess = new ChildProcess(samCliLocation, args)
        childProcess.start()

        return await childProcess.promise()
    }
}

export class DefaultSamCliTaskInvoker implements SamCliTaskInvoker {
    public async invoke(task: vscode.Task): Promise<vscode.TaskExecution> {
        return await ext.vscode.tasks.executeTask(task)
    }
}
