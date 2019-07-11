/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { BasicLogger, getLogger } from '../../logger'
import { map } from '../../utilities/collectionUtils'
import { logAndThrowIfUnexpectedExitCode, SamCliProcessInvoker } from './samCliInvokerUtils'

export interface SamCliDeployParameters {
    templateFile: string
    parameterOverrides: Map<string, string>
    profile: string
    region: string
    stackName: string
}

export async function runSamCliDeploy(
    deployArguments: SamCliDeployParameters,
    invoker: SamCliProcessInvoker,
    logger: BasicLogger = getLogger(),
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

    const childProcessResult = await invoker.invoke({ arguments: args })

    logAndThrowIfUnexpectedExitCode(childProcessResult, 0, logger)
}
