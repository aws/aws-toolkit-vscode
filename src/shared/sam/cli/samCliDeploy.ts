/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { getLogger, Logger } from '../../logger'
import { ChildProcessResult } from '../../utilities/childProcess'
import { DefaultSamCliProcessInvoker } from './samCliInvoker'
import { SamCliProcessInvoker } from './samCliInvokerUtils'

export class SamCliDeployInvocation {
    public constructor(
        private readonly templateFile: string,
        private readonly stackName: string,
        private readonly invoker: SamCliProcessInvoker =
            new DefaultSamCliProcessInvoker(),
        private readonly region: string
    ) {
    }

    public async execute(): Promise<void> {
        const logger: Logger = getLogger()
        const { exitCode, error, stderr, stdout }: ChildProcessResult = await this.invoker.invoke(
            'deploy',
            '--template-file', this.templateFile,
            '--stack-name', this.stackName,
            '--capabilities', 'CAPABILITY_IAM',
            '--region', this.region
        )

        if (exitCode === 0) {
            return
        }

        console.error('SAM deploy error')
        console.error(`Exit code: ${exitCode}`)
        console.error(`Error: ${error}`)
        console.error(`stderr: ${stderr}`)
        console.error(`stdout: ${stdout}`)

        const err =
            new Error(`sam deploy encountered an error: ${error && error.message ? error.message : stderr || stdout}`)
        logger.error(err)
        throw err
    }
}
