/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLogger } from '../../logger/logger'
import { map } from '../../utilities/collectionUtils'
import { logAndThrowIfUnexpectedExitCode, SamCliProcessInvoker } from './samCliInvokerUtils'

export interface SamCliDeployParameters {
    templateFile: string
    parameterOverrides: Map<string, string>
    environmentVariables: NodeJS.ProcessEnv
    region: string
    stackName: string
    s3Bucket: string
    ecrRepo?: string
}

export async function runSamCliDeploy(
    deployArguments: SamCliDeployParameters,
    invoker: SamCliProcessInvoker
): Promise<void> {
    const args = [
        'deploy',
        ...(getLogger().logLevelEnabled('debug') ? ['--debug'] : []),
        '--template-file',
        deployArguments.templateFile,
        '--stack-name',
        deployArguments.stackName,
        '--capabilities',
        'CAPABILITY_IAM',
        'CAPABILITY_NAMED_IAM',
        'CAPABILITY_AUTO_EXPAND',
        '--region',
        deployArguments.region,
        '--s3-bucket',
        deployArguments.s3Bucket,
    ]

    if (deployArguments.ecrRepo) {
        args.push('--image-repository', deployArguments.ecrRepo)
    }

    if (deployArguments.parameterOverrides.size > 0) {
        const overrides = [...map(deployArguments.parameterOverrides.entries(), ([key, value]) => `${key}=${value}`)]
        args.push('--parameter-overrides', ...overrides)
    }

    const childProcessResult = await invoker.invoke({
        arguments: args,
        spawnOptions: { env: deployArguments.environmentVariables },
    })

    logAndThrowIfUnexpectedExitCode(childProcessResult, 0)
}
