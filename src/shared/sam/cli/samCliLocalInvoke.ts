/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as vscode from 'vscode'
import { fileExists } from '../../filesystemUtilities'
import { DefaultSamCliTaskInvoker } from './samCliInvoker'
import { SamCliTaskInvoker } from './samCliInvokerUtils'

export interface SamCliLocalInvokeInvocationArguments {
    /**
     * The name of the resource in the SAM Template to be invoked.
     */
    templateResourceName: string,
    /**
     * Location of the SAM Template to invoke locally against.
     */
    templatePath: string,
    /**
     * Location of the file containing the Lambda Function event payload.
     */
    eventPath: string,
    /**
     * Location of the file containing the environment variables to invoke the Lambda Function against.
     */
    environmentVariablePath: string,
    /**
     * When specified, starts the Lambda function container in debug mode and exposes this port on the local host.
     */
    debugPort?: string,
    /**
     * Manages the sam cli execution.
     */
    invoker: SamCliTaskInvoker,
    /**
     * Specifies the name or id of an existing Docker network to Lambda Docker containers should connect to,
     * along with the default bridge network.
     * If not specified, the Lambda containers will only connect to the default bridge Docker network.
     */
    dockerNetwork?: string,
    /**
     * Specifies whether the command should skip pulling down the latest Docker image for Lambda runtime.
     */
    skipPullImage?: boolean,
}

export class SamCliLocalInvokeInvocation {
    private readonly templateResourceName: string
    private readonly templatePath: string
    private readonly eventPath: string
    private readonly environmentVariablePath: string
    private readonly debugPort?: string
    private readonly invoker: SamCliTaskInvoker
    private readonly dockerNetwork?: string
    private readonly skipPullImage: boolean

    /**
     * @see SamCliLocalInvokeInvocationArguments for parameter info
     * invoker - Defaults to DefaultSamCliTaskInvoker
     * skipPullImage - Defaults to false (the latest Docker image will be pulled down if necessary)
     */
    public constructor({
        invoker = new DefaultSamCliTaskInvoker(),
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
