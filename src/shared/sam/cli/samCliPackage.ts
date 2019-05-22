/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { BasicLogger, getLogger } from '../../logger'
import { ChildProcessResult } from '../../utilities/childProcess'
import { SamCliProcessInvoker } from './samCliInvokerUtils'

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
    const { exitCode, error, stderr, stdout }: ChildProcessResult = await invoker.invoke(
        'package',
        '--template-file', packageArguments.sourceTemplateFile,
        '--s3-bucket', packageArguments.s3Bucket,
        '--output-template-file', packageArguments.destinationTemplateFile,
        '--region', packageArguments.region,
        '--profile', packageArguments.profile
    )

    if (exitCode === 0) {
        return
    }

    console.error('SAM package error')
    console.error(`Exit code: ${exitCode}`)
    console.error(`Error: ${error}`)
    console.error(`stderr: ${stderr}`)
    console.error(`stdout: ${stdout}`)

    const message = error && error.message ? error.message : stderr || stdout
    const err = new Error(`sam package encountered an error: ${message}`)
    logger.error(err)
    throw err
}
