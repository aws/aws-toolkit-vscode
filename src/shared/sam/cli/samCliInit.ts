/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as semver from 'semver'
import { SamLambdaRuntime } from '../../../lambda/models/samLambdaRuntime'
import { getSamCliVersion, SamCliContext } from './samCliContext'
import { logAndThrowIfUnexpectedExitCode } from './samCliInvokerUtils'
import { SAM_CLI_VERSION_0_30 } from './samCliValidator'

export interface SamCliInitArgs {
    runtime: SamLambdaRuntime
    location: string
    name: string
}

export async function runSamCliInit(initArguments: SamCliInitArgs, context: SamCliContext): Promise<void> {
    const args = ['init', '--name', initArguments.name, '--runtime', initArguments.runtime]
    const samCliVersion = await getSamCliVersion(context)

    if (semver.gte(samCliVersion, SAM_CLI_VERSION_0_30)) {
        args.push('--no-interactive')
    }

    const childProcessResult = await context.invoker.invoke({
        spawnOptions: { cwd: initArguments.location },
        arguments: args
    })

    logAndThrowIfUnexpectedExitCode(childProcessResult, 0)
}
