/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { getLogger, Logger } from '../../logger'
import { DefaultSamCliProcessInvoker } from './samCliInvoker'
import { logAndThrowIfUnexpectedExitCode, SamCliProcessInvoker } from './samCliInvokerUtils'

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
        const childProcessResult = await this.invoker.invoke({ arguments: ['--info'] })

        logAndThrowIfUnexpectedExitCode(childProcessResult, 0)
        const response = this.convertOutput(childProcessResult.stdout)

        if (!response) {
            throw new Error('SAM CLI did not return expected data')
        }

        return response
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
