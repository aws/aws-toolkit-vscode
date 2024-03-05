/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLogger } from '../../shared/logger/logger'
import { AmazonqApproachInvoke, AmazonqCodeGenerationInvoke, Metric } from '../../shared/telemetry/telemetry'
import { LLMResponseType } from '../types'

const performance = globalThis.performance ?? require('perf_hooks').performance

export class TelemetryHelper {
    public generateApproachIteration: number
    public generateApproachLastInvocationTime: number
    public generateCodeIteration: number
    public generateCodeLastInvocationTime: number
    public codeGenerationResult: string
    public numberOfFilesGenerated: number
    public repositorySize: number
    public amazonqNumberOfReferences: number
    public sessionStartTime: number

    constructor() {
        this.generateApproachIteration = 0
        this.generateApproachLastInvocationTime = 0
        this.generateCodeIteration = 0
        this.generateCodeLastInvocationTime = 0
        this.codeGenerationResult = ''
        this.numberOfFilesGenerated = 0
        this.repositorySize = 0
        this.amazonqNumberOfReferences = 0
        this.sessionStartTime = performance.now()
    }

    public recordUserApproachTelemetry(
        span: Metric<AmazonqApproachInvoke>,
        amazonqConversationId: string,
        responseType: LLMResponseType
    ) {
        const event = {
            amazonqConversationId,
            amazonqGenerateApproachIteration: this.generateApproachIteration,
            amazonqGenerateApproachLatency: performance.now() - this.generateApproachLastInvocationTime,
            amazonqGenerateApproachResponseType: responseType,
        }
        getLogger().debug(`recordUserApproachTelemetry: %O`, event)
        span.record(event)
    }

    public recordUserCodeGenerationTelemetry(span: Metric<AmazonqCodeGenerationInvoke>, amazonqConversationId: string) {
        const event = {
            amazonqConversationId,
            amazonqGenerateCodeIteration: this.generateCodeIteration,
            amazonqGenerateCodeResponseLatency: performance.now() - this.generateCodeLastInvocationTime,
            amazonqCodeGenerationResult: this.codeGenerationResult,
            amazonqRepositorySize: this.repositorySize,
            ...(this.numberOfFilesGenerated && { amazonqNumberOfFilesGenerated: this.numberOfFilesGenerated }),
            ...(this.amazonqNumberOfReferences && { amazonqNumberOfReferences: this.amazonqNumberOfReferences }),
        }
        getLogger().debug(`recordUserCodeGenerationTelemetry: %O`, event)

        span.record(event)
    }

    public setGenerateApproachIteration(generateApproachIteration: number) {
        this.generateApproachIteration = generateApproachIteration
    }

    public setGenerateCodeIteration(generateCodeIteration: number) {
        this.generateCodeIteration = generateCodeIteration
    }

    public setGenerateApproachLastInvocationTime() {
        this.generateApproachLastInvocationTime = performance.now()
    }

    public setGenerateCodeLastInvocationTime() {
        this.generateCodeLastInvocationTime = performance.now()
    }

    public setCodeGenerationResult(status: string) {
        this.codeGenerationResult = status
    }

    public setNumberOfFilesGenerated(numberOfFilesGenerated: number) {
        this.numberOfFilesGenerated = numberOfFilesGenerated
    }

    public setRepositorySize(repositorySize: number) {
        this.repositorySize = repositorySize
    }

    public setAmazonqNumberOfReferences(numberOfReferences: number) {
        this.amazonqNumberOfReferences = numberOfReferences
    }
}
