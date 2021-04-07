/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLogger, Logger } from '../../logger'
import { SamCliConfiguration } from './samCliConfiguration'
import { DefaultSamCliProcessInvoker } from './samCliInvoker'
import { logAndThrowIfUnexpectedExitCode, SamCliProcessInvoker } from './samCliInvokerUtils'

/**
 * Maps out the response text from the sam cli command `sam --info`
 */
export interface SamCliInfoResponse {
    version: string
}

export class SamCliInfoInvocation {
    private readonly invoker: SamCliProcessInvoker
    public constructor(params: {
        invoker?: SamCliProcessInvoker
        preloadedConfig?: SamCliConfiguration
        locationProvider?: { getLocation(): Promise<string | undefined> }
    }) {
        if (
            (params.invoker && params.preloadedConfig) ||
            (params.invoker && params.locationProvider) ||
            (params.preloadedConfig && params.locationProvider)
        ) {
            throw new Error('Invalid constructor args for SamCliInfoInvocation')
        }
        if (params.invoker) {
            this.invoker = params.invoker
        } else if (params.preloadedConfig) {
            this.invoker = new DefaultSamCliProcessInvoker({ preloadedConfig: params.preloadedConfig })
        } else if (params.locationProvider) {
            this.invoker = new DefaultSamCliProcessInvoker({ locationProvider: params.locationProvider })
        } else {
            throw new Error('Invalid constructor args for SamCliInfoInvocation')
        }
    }

    public async execute(): Promise<SamCliInfoResponse> {
        const childProcessResult = await this.invoker.invoke({
            // "info" command is noisy and uninteresting, don't log it.
            logging: false,
            arguments: ['--info'],
        })

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
