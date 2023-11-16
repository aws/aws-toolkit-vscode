/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLogger } from '../../shared/logger/logger'
import { telemetry } from '../../shared/telemetry/telemetry'

const performance = globalThis.performance ?? require('perf_hooks').performance

export class TelemetryHelper {
    public generateApproachIteration: number
    public generateApproachLastInvocationTime: number
    public generateCodeIteration: number
    public generateCodeLastInvocationTime: number
    public codeGenerationResult: string
    public numberOfFilesGenerated: number
    public repositorySize: number

    constructor() {
        this.generateApproachIteration = 0
        this.generateApproachLastInvocationTime = 0
        this.generateCodeIteration = 0
        this.generateCodeLastInvocationTime = 0
        this.codeGenerationResult = ''
        this.numberOfFilesGenerated = 0
        this.repositorySize = 0
    }
    static #instance: TelemetryHelper
    public static get instance() {
        return (this.#instance ??= new this())
    }
    public recordUserApproachTelemetry(amazonqConversationId: string) {
        const event = {
            amazonqConversationId,
            amazonqGenerateApproachIteration: this.generateApproachIteration,
            amazonGenerateApproachLatency: performance.now() - this.generateApproachLastInvocationTime,
        }
        getLogger().debug(`recordUserApproachTelemetry: %O`, event)

        telemetry.amazonq_approachIteration.emit(event)
    }
    public recordUserCodeGenerationTelemetry(amazonqConversationId: string) {
        const event = {
            amazonqConversationId,
            amazonqGenerateCodeIteration: this.generateCodeIteration,
            amazonqGenerateCodeResponseLatency: performance.now() - this.generateCodeLastInvocationTime,
            // TODO: should be codeGenerationResult: this.codeGenerationResult. Type should be fixed on /aws-toolkit-common/
            amazonqCodeGenerationResult: 0,
            amazonqNumberOfFilesGenerated: this.numberOfFilesGenerated,
            amazonqRepositorySize: this.repositorySize,
        }
        getLogger().debug(`recordUserCodeGenerationTelemetry: %O`, event)

        telemetry.amazonq_codeGenerationIteration.emit(event)
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
}
