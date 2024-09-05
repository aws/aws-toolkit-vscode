/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { globals } from '../../shared'
import { getLogger } from '../../shared/logger/logger'
import { AmazonqApproachInvoke, AmazonqCodeGenerationInvoke, Metric } from '../../shared/telemetry/telemetry'
import { LLMResponseType } from '../types'

/**
 * Helper class for managing telemetry data for Amazon Q Feature Development.
 */
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

    /**
     * Records telemetry data for user approach.
     * @param {Metric<AmazonqApproachInvoke>} span - The metric span for Amazon Q approach invoke.
     * @param {string} amazonqConversationId - The Amazon Q conversation ID.
     * @param {LLMResponseType} responseType - The type of LLM response.
     */
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
        if (globals.telemetry.telemetryEnabled) {
            getLogger().debug(`recordUserApproachTelemetry: %O`, event)
        }
        span.record(event)
    }

    /**
     * Records telemetry data for user code generation.
     * @param {Metric<AmazonqCodeGenerationInvoke>} span - The metric span for Amazon Q code generation invoke.
     * @param {string} amazonqConversationId - The Amazon Q conversation ID.
     */
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

    /**
     * Sets the iteration number for generating approach.
     * @param {number} generateApproachIteration - The iteration number to set.
     */
    public setGenerateApproachIteration(generateApproachIteration: number) {
        this.generateApproachIteration = generateApproachIteration
    }

    /**
     * Sets the iteration number for generating code.
     * @param {number} generateCodeIteration - The iteration number to set.
     */
    public setGenerateCodeIteration(generateCodeIteration: number) {
        this.generateCodeIteration = generateCodeIteration
    }

    /**
     * Sets the last invocation time for generating approach.
     */
    public setGenerateApproachLastInvocationTime() {
        this.generateApproachLastInvocationTime = performance.now()
    }

    /**
     * Sets the last invocation time for generating code.
     */
    public setGenerateCodeLastInvocationTime() {
        this.generateCodeLastInvocationTime = performance.now()
    }

    /**
     * Sets the result of code generation.
     * @param {string} status - The status of code generation.
     */
    public setCodeGenerationResult(status: string) {
        this.codeGenerationResult = status
    }

    /**
     * Sets the number of files generated.
     * @param {number} numberOfFilesGenerated - The number of files generated.
     */
    public setNumberOfFilesGenerated(numberOfFilesGenerated: number) {
        this.numberOfFilesGenerated = numberOfFilesGenerated
    }

    /**
     * Sets the size of the repository.
     * @param {number} repositorySize - The size of the repository in bytes.
     */
    public setRepositorySize(repositorySize: number) {
        this.repositorySize = repositorySize
    }

    /**
     * Sets the number of references for Amazon Q.
     * @param {number} numberOfReferences - The number of references.
     */
    public setAmazonqNumberOfReferences(numberOfReferences: number) {
        this.amazonqNumberOfReferences = numberOfReferences
    }
}
