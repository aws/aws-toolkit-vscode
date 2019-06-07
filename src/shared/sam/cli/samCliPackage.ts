/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { BasicLogger, getLogger } from '../../logger'
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
    profile: string
    region: string
    s3Bucket: string
}

export async function runSamCliPackage(
    packageArguments: SamCliPackageParameters,
    invoker: SamCliProcessInvoker,
    logger: BasicLogger = getLogger(),
): Promise<void> {
    const childProcessResult = await invoker.invoke({
        arguments: [
            'package',
            '--template-file', packageArguments.sourceTemplateFile,
            '--s3-bucket', packageArguments.s3Bucket,
            '--output-template-file', packageArguments.destinationTemplateFile,
            '--region', packageArguments.region,
            '--profile', packageArguments.profile
        ]
    })

    logAndThrowIfUnexpectedExitCode(childProcessResult, 0, logger)
}
