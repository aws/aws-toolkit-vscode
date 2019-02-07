/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { ChildProcessResult } from '../../utilities/childProcess'
import { DefaultSamCliProcessInvoker, SamCliProcessInvoker } from './samCliInvoker'

export class SamCliDeployInvocation {
    public constructor(
        private readonly templateFile: string,
        private readonly stackName: string,
        private readonly invoker: SamCliProcessInvoker = new DefaultSamCliProcessInvoker()
    ) {
    }

    public async execute(): Promise<void> {
        await this.validate()

        const { exitCode, error, stderr, stdout }: ChildProcessResult = await this.invoker.invoke(
            'deploy',
            '--template-file', this.templateFile,
            '--stack-name', this.stackName,
            '--capabilities', 'CAPABILITY_IAM'
        )

        if (exitCode === 0) {
            return
        }

        console.error('SAM deploy error')
        console.error(`Exit code: ${exitCode}`)
        console.error(`Error: ${error}`)
        console.error(`stderr: ${stderr}`)
        console.error(`stdout: ${stdout}`)

        throw new Error(`sam deploy encountered an error: ${error && error.message ? error.message : stderr || stdout}`)
    }

    private async validate(): Promise<void> {
        // TODO: Validate that templateFile exists.
        // TODO: Validate that stackName is a valid name.
    }
}
