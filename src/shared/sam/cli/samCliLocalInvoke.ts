/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as vscode from 'vscode'
import { extensionSettingsPrefix } from '../../constants'
import { fileExists } from '../../filesystemUtilities'
import { DefaultSettingsConfiguration } from '../../settingsConfiguration'
import { SamCliConfiguration } from './samCliConfiguration'
import { SamCliInvocation } from './samCliInvocation'
import { DefaultSamCliLocationProvider } from './samCliLocator'

export interface SamCliLocalInvokeResponse {
    taskExecution: vscode.TaskExecution
}

export class SamCliLocalInvokeInvocation extends SamCliInvocation<SamCliLocalInvokeResponse> {

    private readonly _taskDefinition: vscode.TaskDefinition = {
        type: 'samLocalInvoke',
    }

    public constructor(
        private readonly templateResourceName: string,
        private readonly templatePath: string,
        private readonly eventPath: string,
        private readonly debugPort?: string,
        config: SamCliConfiguration = new SamCliConfiguration(
            new DefaultSettingsConfiguration(extensionSettingsPrefix),
            new DefaultSamCliLocationProvider()
        )) {
        super(config)
    }

    public async execute(): Promise<SamCliLocalInvokeResponse> {
        await this.validate()

        const args: string[] = [
            'local',
            'invoke',
            this.templateResourceName,
            '--template',
            this.templatePath,
            '--event',
            this.eventPath,
        ]

        if (!!this.debugPort) {
            args.push('-d', this.debugPort)
        }

        const execution: vscode.ShellExecution = new vscode.ShellExecution(
            'sam',
            args
        )

        const task: vscode.Task = new vscode.Task(
            this._taskDefinition,
            vscode.TaskScope.Workspace,
            'LocalLambdaDebug',
            'SAM CLI',
            execution,
            []
        )

        const taskExecution: vscode.TaskExecution = await vscode.tasks.executeTask(task)

        return {
            taskExecution: taskExecution
        }
    }

    protected async validate(): Promise<void> {
        await super.validate()

        if (!this.templateResourceName) {
            throw new Error('template resource name is missing or empty')
        }

        if (!await fileExists(this.templatePath)) {
            throw new Error(`template path does not exist: ${this.templatePath}`)
        }

        if (!await fileExists(this.eventPath)) {
            throw new Error(`event path does not exist: ${this.eventPath}`)
        }
    }
}
