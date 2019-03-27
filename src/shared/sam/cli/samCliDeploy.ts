/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { getLogger, Logger } from '../../logger'
import { ChildProcessResult } from '../../utilities/childProcess'
import { map } from '../../utilities/collectionUtils'
import { DefaultSamCliProcessInvoker } from './samCliInvoker'
import { SamCliProcessInvoker } from './samCliInvokerUtils'

export class SamCliDeployInvocation {
    public constructor(
        private readonly templateFile: string,
        private readonly stackName: string,
        private readonly region: string,
        private readonly parameterOverrides: Map<string, string>,
        private readonly invoker: SamCliProcessInvoker = new DefaultSamCliProcessInvoker(),
    ) {
    }

    public async execute(): Promise<void> {
        const logger: Logger = getLogger()

        const args = [
            'deploy',
            '--template-file', this.templateFile,
            '--stack-name', this.stackName,
            '--capabilities', 'CAPABILITY_IAM',
            '--region', this.region,
        ]
        if (this.parameterOverrides.size > 0) {
            const overrides = [
                ...map(
                    this.parameterOverrides.entries(),
                    ([key, value]) => `${key}=${value}`
                )
            ]
            args.push('--parameter-overrides', ...overrides)
        }

        const { exitCode, error, stderr, stdout }: ChildProcessResult = await this.invoker.invoke(...args)

        if (exitCode === 0) {
            return
        }

        console.error('SAM deploy error')
        console.error(`Exit code: ${exitCode}`)
        console.error(`Error: ${error}`)
        console.error(`stderr: ${stderr}`)
        console.error(`stdout: ${stdout}`)

        const message = error && error.message ? error.message : stderr || stdout
        const err = new Error(`sam deploy encountered an error: ${message}`)
        logger.error(err)
        throw err
    }
}
