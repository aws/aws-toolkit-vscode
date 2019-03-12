/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as vscode from 'vscode'
import { fileExists } from '../../filesystemUtilities'
import { DefaultSamCliTaskInvoker, SamCliTaskInvoker } from './samCliInvoker'

export interface SamCliLocalInvokeInvocationArguments {
    templateResourceName: string,
    templatePath: string,
    eventPath: string,
    environmentVariablePath: string,
    debugPort?: string,
    invoker: SamCliTaskInvoker,
}

export class SamCliLocalInvokeInvocation {
    private readonly templateResourceName: string
    private readonly templatePath: string
    private readonly eventPath: string
    private readonly environmentVariablePath: string
    private readonly debugPort?: string
    private readonly invoker: SamCliTaskInvoker

    public constructor({
        invoker = new DefaultSamCliTaskInvoker(),
        ...params
    }: SamCliLocalInvokeInvocationArguments
    ) {
        this.templateResourceName = params.templateResourceName
        this.templatePath = params.templatePath
        this.eventPath = params.eventPath
        this.environmentVariablePath = params.environmentVariablePath
        this.debugPort = params.debugPort
        this.invoker = invoker
    }

    public async execute(): Promise<void> {
        await this.validate()

        const args = [
            'local',
            'invoke',
            this.templateResourceName,
            '--template',
            this.templatePath,
            '--event',
            this.eventPath,
            '--env-vars',
            this.environmentVariablePath
        ]
        if (!!this.debugPort) {
            args.push('-d', this.debugPort)
        }

        const execution = new vscode.ShellExecution('sam', args)

        await this.invoker.invoke(new vscode.Task(
            {
                type: 'samLocalInvoke',
            },
            vscode.TaskScope.Workspace,
            'LocalLambdaDebug',
            'SAM CLI',
            execution
        ))
    }

    protected async validate(): Promise<void> {
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
