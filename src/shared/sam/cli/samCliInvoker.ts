/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as vscode from 'vscode'
import { extensionSettingsPrefix } from '../../constants'
import { DefaultSettingsConfiguration } from '../../settingsConfiguration'
import { ChildProcess, ChildProcessResult } from '../../utilities/childProcess'
import { DefaultSamCliConfiguration, SamCliConfiguration } from './samCliConfiguration'
import { DefaultSamCliLocationProvider } from './samCliLocator'

export interface SamCliInvoker {
    build(buildDir: string, baseDir: string, templatePath: string): Promise<ChildProcessResult>

    info(): Promise<ChildProcessResult>

    localInvoke(
        templateResourceName: string,
        templatePath: string,
        eventPath: string,
        debugPort?: string
    ): Promise<vscode.TaskExecution>
}

export class DefaultSamCliInvoker implements SamCliInvoker {
    public constructor(private readonly config: SamCliConfiguration = new DefaultSamCliConfiguration(
        new DefaultSettingsConfiguration(extensionSettingsPrefix),
        new DefaultSamCliLocationProvider()
    )) {
    }

    public async build(buildDir: string, baseDir: string, templatePath: string): Promise<ChildProcessResult> {
        return await this.invoke(
            'build',
            '--build-dir', buildDir,
            '--base-dir', baseDir,
            '--template', templatePath
        )
    }

    public async info(): Promise<ChildProcessResult> {
        return await this.invoke('--info')
    }

    public async localInvoke(
        templateResourceName: string,
        templatePath: string,
        eventPath: string,
        debugPort?: string
    ): Promise<vscode.TaskExecution> {
        const args: string[] = [
            'local',
            'invoke',
            templateResourceName,
            '--template',
            templatePath,
            '--event',
            eventPath,
        ]

        if (!!debugPort) {
            args.push('-d', debugPort)
        }

        const execution: vscode.ShellExecution = new vscode.ShellExecution(
            'sam',
            args
        )

        const task: vscode.Task = new vscode.Task(
            {
                type: 'samLocalInvoke',
            },
            vscode.TaskScope.Workspace,
            'LocalLambdaDebug',
            'SAM CLI',
            execution,
            []
        )

        return await vscode.tasks.executeTask(task)
    }

    private async invoke(...args: string[]): Promise<ChildProcessResult> {
        const samCliLocation = this.config.getSamCliLocation()
        if (!samCliLocation) {
            throw new Error('SAM CLI location not configured')
        }

        const childProcess: ChildProcess = new ChildProcess(samCliLocation, args)
        childProcess.start()

        return await childProcess.promise()
    }
}
