/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
}

export async function runSamCliPackage(
    packageArguments: SamCliPackageParameters,
    invoker: SamCliProcessInvoker
): Promise<void> {
    const childProcessResult = await invoker.invoke({
        arguments: [
            'package',
            '--template-file',
            packageArguments.sourceTemplateFile,
            '--s3-bucket',
            packageArguments.s3Bucket,
            '--output-template-file',
            packageArguments.destinationTemplateFile,
            '--region',
            packageArguments.region
        ],
        spawnOptions: {
            env: packageArguments.environmentVariables
        }
    })

    logAndThrowIfUnexpectedExitCode(childProcessResult, 0)
}
