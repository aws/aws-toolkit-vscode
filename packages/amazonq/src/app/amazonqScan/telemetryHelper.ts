/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { telemetry } from 'aws-core-vscode/telemetry'
import { AuthUtil } from 'aws-core-vscode/codewhisperer'

export class ReviewTelemetryHelper {
    static #instance: ReviewTelemetryHelper

    public static get instance() {
        return (this.#instance ??= new this())
    }

    public recordReviewStart(scope: 'file' | 'project', fileName?: string) {
        telemetry.amazonq_reviewStart.emit({
            result: 'Succeeded',
            amazonqReviewScope: scope,
            amazonqReviewFileName: fileName,
            credentialStartUrl: AuthUtil.instance.startUrl,
        })
    }

    public recordReviewComplete(
        scope: 'file' | 'project',
        issuesFound: number,
        criticalIssues: number,
        highIssues: number,
        mediumIssues: number,
        lowIssues: number,
        infoIssues: number,
        duration: number
    ) {
        telemetry.amazonq_reviewComplete.emit({
            result: 'Succeeded',
            amazonqReviewScope: scope,
            amazonqReviewIssuesFound: issuesFound,
            amazonqReviewCriticalIssues: criticalIssues,
            amazonqReviewHighIssues: highIssues,
            amazonqReviewMediumIssues: mediumIssues,
            amazonqReviewLowIssues: lowIssues,
            amazonqReviewInfoIssues: infoIssues,
            amazonqReviewDuration: duration,
            credentialStartUrl: AuthUtil.instance.startUrl,
        })
    }

    public recordReviewError(scope: 'file' | 'project', errorCode: string) {
        telemetry.amazonq_reviewError.emit({
            result: 'Failed',
            amazonqReviewScope: scope,
            amazonqReviewErrorCode: errorCode,
            credentialStartUrl: AuthUtil.instance.startUrl,
        })
    }

    public recordFixApplied(issueType: string, fixSuccess: boolean) {
        telemetry.amazonq_reviewFixApplied.emit({
            result: fixSuccess ? 'Succeeded' : 'Failed',
            amazonqReviewIssueType: issueType,
            credentialStartUrl: AuthUtil.instance.startUrl,
        })
    }
}