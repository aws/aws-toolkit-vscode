/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { SamLambdaRuntime } from '../../../lambda/models/samLambdaRuntime'
import { logAndThrowIfUnexpectedExitCode, SamCliProcessInvoker } from './samCliInvokerUtils'

export interface SamCliInitArgs {
    runtime: SamLambdaRuntime
    location: string
    name: string
}

export async function runSamCliInit(
    initArguments: SamCliInitArgs,
    invoker: SamCliProcessInvoker
): Promise<void> {
    const childProcessResult = await invoker.invoke(
        {
            spawnOptions: { cwd: initArguments.location },
            arguments: [
                'init',
                '--name', initArguments.name,
                '--runtime', initArguments.runtime
            ]
        }
    )

    logAndThrowIfUnexpectedExitCode(childProcessResult, 0)
}
