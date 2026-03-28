/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { telemetry } from 'aws-core-vscode/telemetry'
import { AuthUtil } from 'aws-core-vscode/codewhisperer'

export class DevelopmentTelemetryHelper {
    static #instance: DevelopmentTelemetryHelper

    public static get instance() {
        return (this.#instance ??= new this())
    }

    public recordCodeGeneration(
        language: string,
        linesGenerated: number,
        filesGenerated: number,
        success: boolean
    ) {
        telemetry.amazonq_codeGeneration.emit({
            result: success ? 'Succeeded' : 'Failed',
            amazonqCodeGenLanguage: language,
            amazonqCodeGenLinesGenerated: linesGenerated,
            amazonqCodeGenFilesGenerated: filesGenerated,
            credentialStartUrl: AuthUtil.instance.startUrl,
        })
    }

    public recordProjectCreation(projectType: string, success: boolean) {
        telemetry.amazonq_projectCreation.emit({
            result: success ? 'Succeeded' : 'Failed',
            amazonqProjectType: projectType,
            credentialStartUrl: AuthUtil.instance.startUrl,
        })
    }

    public recordDevelopmentActivity(
        activityType: 'explain' | 'optimize' | 'refactor' | 'test',
        language: string,
        duration: number
    ) {
        telemetry.amazonq_developmentActivity.emit({
            result: 'Succeeded',
            amazonqActivityType: activityType,
            amazonqActivityLanguage: language,
            amazonqActivityDuration: duration,
            credentialStartUrl: AuthUtil.instance.startUrl,
        })
    }

    public recordFeatureUsage(featureName: string, context?: string) {
        telemetry.amazonq_featureUsage.emit({
            result: 'Succeeded',
            amazonqFeatureName: featureName,
            amazonqFeatureContext: context,
            credentialStartUrl: AuthUtil.instance.startUrl,
        })
    }
}