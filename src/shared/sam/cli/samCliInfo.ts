/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { getLogger, Logger } from '../../logger'
import { ChildProcessResult } from '../../utilities/childProcess'
import { DefaultSamCliProcessInvoker } from './samCliInvoker'
import { SamCliProcessInvoker } from './samCliInvokerUtils'

/**
 * Maps out the response text from the sam cli command `sam --info`
 */
export interface SamCliInfoResponse {
    version: string
}

export class SamCliInfoInvocation {
    public constructor(
        private readonly invoker: SamCliProcessInvoker = new DefaultSamCliProcessInvoker()
    ) {
    }

    public async execute(): Promise<SamCliInfoResponse> {
        const logger: Logger = getLogger()
        const { error, exitCode, stderr, stdout }: ChildProcessResult = await this.invoker.invoke('--info')

        if (exitCode === 0) {
            const response = this.convertOutput(stdout)

            if (!!response) {
                return response
            }

            throw new Error('SAM CLI did not return expected data')
        }

        console.error('SAM CLI error')
        console.error(`Exit code: ${exitCode}`)
        console.error(`Error: ${error}`)
        console.error(`stderr: ${stderr}`)
        console.error(`stdout: ${stdout}`)

        const err = new Error(
            `sam --info encountered an error: ${error}
    ${error && error.message ? 'message: ' + error.message : ''}
    stderr : ${stderr}
    stdout : ${stdout}`
        )
        logger.error(err)
        throw err
    }

    /**
     * Parses the output into a typed object with expected data
     * @param text output from a `sam --info` call
     */
    protected convertOutput(text: string): SamCliInfoResponse | undefined {
        const logger: Logger = getLogger()
        try {
            return JSON.parse(text) as SamCliInfoResponse
        } catch (err) {
            logger.error(err as Error)

            return undefined
        }
    }
}
