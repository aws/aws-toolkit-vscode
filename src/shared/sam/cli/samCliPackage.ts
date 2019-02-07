/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { ChildProcessResult } from '../../utilities/childProcess'
import { DefaultSamCliProcessInvoker, SamCliProcessInvoker } from './samCliInvoker'

export interface SamCliPackageResponse {
    templateContent: string
}

export class SamCliPackageInvocation {
    public constructor(
        private readonly templateFile: string,
        private readonly s3Bucket: string,
        private readonly invoker: SamCliProcessInvoker = new DefaultSamCliProcessInvoker()
    ) {
    }

    public async execute(): Promise<SamCliPackageResponse> {
        await this.validate()

        const { exitCode, error, stderr, stdout }: ChildProcessResult = await this.invoker.invoke(
            'package',
            '--template-file', this.templateFile,
            '--s3-bucket', this.s3Bucket
        )

        if (exitCode === 0) {
            return {
                templateContent: stdout
            }
        }

        console.error('SAM package error')
        console.error(`Exit code: ${exitCode}`)
        console.error(`Error: ${error}`)
        console.error(`stderr: ${stderr}`)
        console.error(`stdout: ${stdout}`)

        const message = error && error.message ? error.message : stderr || stdout
        throw new Error(`sam package encountered an error: ${message}`)
    }

    private async validate(): Promise<void> {
        // TODO: Validate that templateFile exists.
        // TODO: Validate that s3Bucket is a valid S3 bucket name.
    }
}
