/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { getLogger, Logger } from '../../logger'
import { ChildProcessResult } from '../../utilities/childProcess'
import { map } from '../../utilities/collectionUtils'
import { SamCliProcessInvoker } from './samCliInvokerUtils'

export interface SamCliDeployArgs {
    templateFile: string
    parameterOverrides: Map<string, string>
    profile: string
    region: string
    stackName: string
}

export async function runSamCliDeploy(
    deployArguments: SamCliDeployArgs,
    invoker: SamCliProcessInvoker,
    logger: Logger = getLogger(),
): Promise<void> {
    const args = [
        'deploy',
        '--template-file', deployArguments.templateFile,
        '--stack-name', deployArguments.stackName,
        '--capabilities', 'CAPABILITY_IAM',
        '--region', deployArguments.region,
        '--profile', deployArguments.profile
    ]
    if (deployArguments.parameterOverrides.size > 0) {
        const overrides = [
            ...map(
                deployArguments.parameterOverrides.entries(),
                ([key, value]) => `${key}=${value}`
            )
        ]
        args.push('--parameter-overrides', ...overrides)
    }

    const { exitCode, error, stderr, stdout }: ChildProcessResult = await invoker.invoke(...args)

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
