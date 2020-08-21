/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as child_process from 'child_process'
import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { fileExists } from '../../filesystemUtilities'
import { getLogger, Logger } from '../../logger'
import { Timeout } from '../../utilities/timeoutUtils'
import { DefaultSamCliProcessInvokerContext, SamCliProcessInvokerContext } from './samCliInvoker'
import { SamCliLocalInvokeInvocationArguments, SamLocalInvokeCommand } from './samCliLocalInvoke'

const localize = nls.loadMessageBundle()

export interface SamCliStartApiArguments {
    /**
     * Location of the SAM Template to invoke locally against.
     */
    templatePath: string
    /**
     * Location of the file containing the environment variables to invoke the Lambda Function against.
     */
    environmentVariablePath: string
    /**
     * Environment variables set when invoking the SAM process (NOT passed to the Lambda).
     */
    environmentVariables?: NodeJS.ProcessEnv
    /**
     * When specified, starts the Lambda function container in debug mode and exposes this port on the local host.
     */
    debugPort?: string
    /**
     * Specifies the name or id of an existing Docker network to Lambda Docker containers should connect to,
     * along with the default bridge network.
     * If not specified, the Lambda containers will only connect to the default bridge Docker network.
     */
    dockerNetwork?: string
    /**
     * - true: Do not pull the latest Docker image for Lambda runtime.
     * - false: Pull the latest Docker image if necessary
     */
    skipPullImage?: boolean
    /**
     * Manages the sam cli execution.
     */
    invoker: SamLocalInvokeCommand
    /**
     * Host path to a debugger that will be mounted into the Lambda container.
     */
    debuggerPath?: string
    /**
     * parameter overrides specified in the `sam.template.parameters` field
     */
    parameterOverrides?: string[]
    /** SAM args specified by user (`sam.localArguments`). */
    extraArgs?: string[]
}

/**
 * An elaborate way to run `sam local start-api`.
 */
export class SamCliStartApiInvocation {
    private readonly invokerContext: SamCliProcessInvokerContext

    public constructor(private readonly args: SamCliStartApiArguments) {
        this.args.skipPullImage = this.args.skipPullImage == true

        // Enterprise!
        this.invokerContext = new DefaultSamCliProcessInvokerContext()
    }

    public async execute(timeout?: Timeout): Promise<void> {
        await this.validate()

        const samCommand = this.invokerContext.cliConfig.getSamCliLocation() ?? 'sam'
        const args = this.buildArguments()

        await this.args.invoker.invoke({
            options: {
                env: {
                    ...process.env,
                    ...this.args.environmentVariables,
                },
            },
            command: samCommand,
            args: args,
            isDebug: !!this.args.debugPort,
            timeout,
        })
    }

    protected buildArguments(): string[] {
        const invokeArgs = [
            'local',
            'start-api',
            '--template',
            this.args.templatePath,
            '--env-vars',
            this.args.environmentVariablePath,
        ]

        this.addArgumentIf(invokeArgs, !!this.args.debugPort, '--debug-port', this.args.debugPort!)
        this.addArgumentIf(invokeArgs, !!this.args.dockerNetwork, '--docker-network', this.args.dockerNetwork!)
        this.addArgumentIf(invokeArgs, !!this.args.skipPullImage, '--skip-pull-image')
        this.addArgumentIf(invokeArgs, !!this.args.debuggerPath, '--debugger-path', this.args.debuggerPath!)
        this.addArgumentIf(
            invokeArgs,
            !!this.args.parameterOverrides && this.args.parameterOverrides.length > 0,
            '--parameter-overrides',
            ...(this.args.parameterOverrides ?? [])
        )
        invokeArgs.push(...(this.args.extraArgs ?? []))
        return invokeArgs
    }

    protected async validate(): Promise<void> {
        if (!(await fileExists(this.args.templatePath))) {
            throw new Error(`template path does not exist: ${this.args.templatePath}`)
        }
    }

    private addArgumentIf(args: string[], addIfConditional: boolean, ...argsToAdd: string[]) {
        if (addIfConditional) {
            args.push(...argsToAdd)
        }
    }
}
