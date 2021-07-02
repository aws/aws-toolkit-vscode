/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { logAndThrowIfUnexpectedExitCode, SamCliProcessInvoker } from './samCliInvokerUtils'

export interface SamCliPackageParameters {
    /**
     * The SAM Template to package
     */
    sourceTemplateFile: string
    /**
     * The SAM Template produced by SAM CLI's packaging
     */
    destinationTemplateFile: string
    environmentVariables: NodeJS.ProcessEnv
    region: string
    s3Bucket: string

    /**
     * The URI of an ECR repository
     */
    ecrRepo?: string
}

export async function runSamCliPackage(
    packageArguments: SamCliPackageParameters,
    invoker: SamCliProcessInvoker
): Promise<void> {
    const args = [
        'package',
        '--template-file',
        packageArguments.sourceTemplateFile,
        '--s3-bucket',
        packageArguments.s3Bucket,
        '--output-template-file',
        packageArguments.destinationTemplateFile,
        '--region',
        packageArguments.region,
    ]
    if (packageArguments.ecrRepo) {
        args.push('--image-repository')
        args.push(packageArguments.ecrRepo)
    }
    const childProcessResult = await invoker.invoke({
        arguments: args,
        spawnOptions: {
            env: packageArguments.environmentVariables,
        },
    })

    logAndThrowIfUnexpectedExitCode(childProcessResult, 0)
}
