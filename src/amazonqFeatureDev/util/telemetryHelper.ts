/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLogger } from '../../shared/logger/logger'
import { AmazonqApproachInvoke, Metric } from '../../shared/telemetry/telemetry'

const performance = globalThis.performance ?? require('perf_hooks').performance

export class TelemetryHelper {
    public generateApproachIteration: number
    public generateApproachLastInvocationTime: number
    public numberOfFilesGenerated: number
    public repositorySize: number
    public sessionStartTime: number

    constructor() {
        this.generateApproachIteration = 0
        this.generateApproachLastInvocationTime = 0
        this.numberOfFilesGenerated = 0
        this.repositorySize = 0
        this.sessionStartTime = performance.now()
    }

    public recordUserApproachTelemetry(span: Metric<AmazonqApproachInvoke>, amazonqConversationId: string) {
        const event = {
            amazonqConversationId,
            amazonqGenerateApproachIteration: this.generateApproachIteration,
            amazonqGenerateApproachLatency: performance.now() - this.generateApproachLastInvocationTime,
        }
        getLogger().debug(`recordUserApproachTelemetry: %O`, event)
        span.record(event)
    }

    public setGenerateApproachIteration(generateApproachIteration: number) {
        this.generateApproachIteration = generateApproachIteration
    }

    public setGenerateApproachLastInvocationTime() {
        this.generateApproachLastInvocationTime = performance.now()
    }

    public setNumberOfFilesGenerated(numberOfFilesGenerated: number) {
        this.numberOfFilesGenerated = numberOfFilesGenerated
    }

    public setRepositorySize(repositorySize: number) {
        this.repositorySize = repositorySize
    }
}
