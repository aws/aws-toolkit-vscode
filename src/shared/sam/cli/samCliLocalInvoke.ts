/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as vscode from 'vscode'
import { fileExists } from '../../filesystemUtilities'
import { DefaultSamCliTaskInvoker, SamCliTaskInvoker } from './samCliInvoker'

export interface SamCliLocalInvokeInvocationArguments {
    // Todo : comments incoming...
    templateResourceName: string,
    templatePath: string,
    eventPath: string,
    environmentVariablePath: string,
    debugPort?: string,
    invoker: SamCliTaskInvoker,
    useContainer?: boolean,
    dockerNetwork?: string,
    skipPullImage?: boolean,
}

export class SamCliLocalInvokeInvocation {
    private readonly templateResourceName: string
    private readonly templatePath: string
    private readonly eventPath: string
    private readonly environmentVariablePath: string
    private readonly debugPort?: string
    private readonly invoker: SamCliTaskInvoker
    private readonly useContainer: boolean
    private readonly dockerNetwork?: string
    private readonly skipPullImage: boolean

    /**
     * @see SamCliLocalInvokeInvocationArguments for parameter info
     * invoker - Defaults to DefaultSamCliTaskInvoker
     * useContainer - Defaults to false (function will be built on local machine instead of in a docker image)
     * skipPullImage - Defaults to false (the latest Docker image will be pulled down if necessary)
     */
    public constructor({
        invoker = new DefaultSamCliTaskInvoker(),
        useContainer = false,
        skipPullImage = false,
        ...params
    }: SamCliLocalInvokeInvocationArguments
    ) {
        this.templateResourceName = params.templateResourceName
        this.templatePath = params.templatePath
        this.eventPath = params.eventPath
        this.environmentVariablePath = params.environmentVariablePath
        this.debugPort = params.debugPort
        this.invoker = invoker
        this.useContainer = useContainer
        this.dockerNetwork = params.dockerNetwork
        this.skipPullImage = skipPullImage
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

        this.addArgumentIf(args, !!this.debugPort, '-d', this.debugPort!)
        this.addArgumentIf(args, !!this.dockerNetwork, '--docker-network', this.dockerNetwork!)
        this.addArgumentIf(args, !!this.useContainer, '--use-container')
        this.addArgumentIf(args, !!this.skipPullImage, '--skip-pull-image')

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

    private addArgumentIf(args: string[], addIfConditional: boolean, ...argsToAdd: string[]) {
        if (addIfConditional) {
            args.push(...argsToAdd)
        }
    }
}
