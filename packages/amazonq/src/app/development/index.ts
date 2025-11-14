/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { DevelopmentTelemetryHelper } from './telemetryHelper'

export function recordCodeGenerationUsage(
    language: string,
    generatedCode: string,
    filesCreated: number = 1
) {
    const linesGenerated = generatedCode.split('\n').length
    DevelopmentTelemetryHelper.instance.recordCodeGeneration(
        language,
        linesGenerated,
        filesCreated,
        true
    )
}

export function recordDevelopmentFeatureUsage(featureName: string, context?: string) {
    DevelopmentTelemetryHelper.instance.recordFeatureUsage(featureName, context)
}

export { DevelopmentTelemetryHelper }