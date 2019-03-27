/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as vscode from 'vscode'
import { SamLambdaRuntime } from '../../../lambda/models/samLambdaRuntime'
import { getLogger, Logger } from '../../logger'
import { ChildProcessResult } from '../../utilities/childProcess'
import { DefaultSamCliProcessInvoker } from './samCliInvoker'
import { SamCliProcessInvoker } from './samCliInvokerUtils'

export interface SamCliInitArgs {
    runtime: SamLambdaRuntime
    location: vscode.Uri
    name: string
}

export class SamCliInitInvocation {
    private readonly name: string
    private readonly runtime: string
    private readonly location: vscode.Uri
    public constructor(
        { name, runtime, location }: SamCliInitArgs,
        private readonly invoker: SamCliProcessInvoker =
            new DefaultSamCliProcessInvoker()
    ) {
        this.name = name
        this.runtime = runtime
        this.location = location
    }

    public async execute(): Promise<void> {
        const logger: Logger = getLogger()
        const { exitCode, error, stderr, stdout }: ChildProcessResult = await this.invoker.invoke(
            { cwd: this.location.fsPath },
            'init',
            '--name', this.name,
            '--runtime', this.runtime
        )

        if (exitCode === 0) {
            return
        }

        console.error('SAM CLI error')
        console.error(`Exit code: ${exitCode}`)
        console.error(`Error: ${error}`)
        console.error(`stderr: ${stderr}`)
        console.error(`stdout: ${stdout}`)

        const err = new Error(`sam init encountered an error: ${error && error.message || stderr || stdout}`)
        logger.error(err)
        throw err
    }
}
