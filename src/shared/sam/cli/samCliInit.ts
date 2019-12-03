/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Runtime } from 'aws-sdk/clients/lambda'
import { DependencyManager } from '../../../lambda/models/samLambdaRuntime'
import { SamCliContext } from './samCliContext'
import { logAndThrowIfUnexpectedExitCode } from './samCliInvokerUtils'

export interface SamCliInitArgs {
    runtime: Runtime
    location: string
    name: string
    dependencyManager: DependencyManager
}

export async function runSamCliInit(initArguments: SamCliInitArgs, context: SamCliContext): Promise<void> {
    const args = [
        'init',
        '--name',
        initArguments.name,
        '--runtime',
        initArguments.runtime,
        '--no-interactive',
        '--app-template',
        'hello-world',
        '--dependency-manager',
        initArguments.dependencyManager
    ]

    const childProcessResult = await context.invoker.invoke({
        spawnOptions: { cwd: initArguments.location },
        arguments: args
    })

    logAndThrowIfUnexpectedExitCode(childProcessResult, 0)
}
