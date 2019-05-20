/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { SamLambdaRuntime } from '../../../lambda/models/samLambdaRuntime'
import { getLogger, Logger } from '../../logger'
import { ChildProcessResult } from '../../utilities/childProcess'
import { SamCliProcessInvoker } from './samCliInvokerUtils'

export interface SamCliInitArgs {
    runtime: SamLambdaRuntime
    location: string
    name: string
}

export async function runSamCliInit(
    initArguments: SamCliInitArgs,
    invoker: SamCliProcessInvoker
): Promise<void> {
    const { exitCode, error, stderr, stdout }: ChildProcessResult = await invoker.invoke(
        { cwd: initArguments.location },
        'init',
        '--name', initArguments.name,
        '--runtime', initArguments.runtime
    )

    if (exitCode === 0) {
        return
    }

    console.error('SAM CLI error')
    console.error(`Exit code: ${exitCode}`)
    console.error(`Error: ${error}`)
    console.error(`stderr: ${stderr}`)
    console.error(`stdout: ${stdout}`)

    const logger: Logger = getLogger()
    const err = new Error(`sam init encountered an error: ${error && error.message || stderr || stdout}`)
    logger.error(err)
    throw err
}
