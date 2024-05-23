/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 *
 * This class contains helper methods dedicated to logging metrics specific to
 * CodeTransform
 */

import {
    CodeTransformJavaSourceVersionsAllowed,
    CodeTransformJavaTargetVersionsAllowed,
    CodeTransformApiNames,
    telemetry,
} from '../../shared/telemetry/telemetry'
import { CodeTransformTelemetryState } from '../telemetry/codeTransformTelemetryState'
import { JDKVersion, transformByQState } from '../../codewhisperer/models/model'
import { CreateUploadUrlResponse } from '../../codewhisperer/client/codewhisperer'
import {
    ResumeTransformationResponse,
    StopTransformationResponse,
    StartTransformationResponse,
    GetTransformationPlanResponse,
    GetTransformationResponse,
} from '../../codewhisperer/client/codewhispereruserclient'
import { PromiseResult } from 'aws-sdk/lib/request'
import { AWSError } from 'aws-sdk'
import { MetadataResult } from '../../shared/telemetry/telemetryClient'
import { getLogger } from '../../shared/logger'

export const telemetryUndefined = 'undefined'

export enum CancelActionPositions {
    ApiError = 'apiError',
    LoadingPanel = 'loadingPanelStopButton',
    DevToolsSidePanel = 'devToolsStopButton',
    BottomHubPanel = 'bottomPanelSideNavButton',
    Chat = 'qChatPanel',
}

export const JDKToTelemetryValue = (
    source?: JDKVersion
): CodeTransformJavaSourceVersionsAllowed | CodeTransformJavaTargetVersionsAllowed | undefined => {
    switch (source) {
        case JDKVersion.JDK8:
            return 'JDK_1_8'
        case JDKVersion.JDK11:
            return 'JDK_11'
        case JDKVersion.JDK17:
            return 'JDK_17'
        case JDKVersion.UNSUPPORTED:
            return 'Other'
        default:
            return undefined
    }
}

/**
 * @description We want the output of our Java versions found
 * that are not supported to match IntelliJ output. IntelliJ
 * can read the version easily and for VSCode we must exec
 * the javap -v command.
 */
export const javapOutputToTelemetryValue = (javapCommandLineOutput: string) => {
    switch (javapCommandLineOutput) {
        case '49':
            return 'JDK_1_5'
        case '50':
            return 'JDK_1_6'
        case '51':
            return 'JDK_1_7'
        case '52':
            return 'JDK_1_8'
        case '53':
            return 'JDK_1_9'
        case '54':
            return 'JDK_10'
        case '55':
            return 'JDK_11'
        case '56':
            return 'JDK_12'
        case '57':
            return 'JDK_13'
        case '58':
            return 'JDK_14'
        case '59':
            return 'JDK_15'
        case '60':
            return 'JDK_16'
        case '61':
            return 'JDK_17'
        case '62':
            return 'JDK_18'
        case '63':
            return 'JDK_19'
        case '64':
            return 'JDK_20'
        case '65':
            return 'JDK_21'
        case '66':
            return 'JDK_22'
        default:
            // If nothing found. Output the number and lookup the java 'major version' numbers online
            return javapCommandLineOutput
    }
}

export const calculateTotalLatency = (startTime: number): number => Date.now() - startTime

type GumbyAPIresponse =
    | CreateUploadUrlResponse
    | ResumeTransformationResponse
    | StopTransformationResponse
    | GetTransformationPlanResponse
    | StartTransformationResponse
    | GetTransformationResponse

export class TelemetryHelper {
    private static get sessionId() {
        return CodeTransformTelemetryState.instance.getSessionId()
    }

    static async callApi<T extends GumbyAPIresponse>(parameters: {
        apiCall: () => Promise<PromiseResult<T, AWSError>>
        apiName: CodeTransformApiNames
        errorReason: string
        uploadId?: string
        jobId?: string
        uploadFileByteSize?: number
        setJobFailureMetadata: boolean
        shouldAttachJobFailureMetadataOnError: boolean
    }) {
        const apiStartTime = Date.now()
        let result = undefined
        try {
            result = await parameters.apiCall()
            if (parameters.setJobFailureMetadata && result?.$response.requestId !== undefined) {
                transformByQState.setJobFailureMetadata(` (request ID: ${result.$response.requestId})`)
            }
            return result
        } catch (e: any) {
            let errorMessage = (e as Error).message
            getLogger().error(`CodeTransformation: ${parameters.apiName} error: = ${errorMessage}`)
            if (parameters.shouldAttachJobFailureMetadataOnError) {
                errorMessage += ` -- ${transformByQState.getJobFailureMetadata()}`
            }
            telemetry.codeTransform_logApiError.emit({
                codeTransformApiNames: parameters.apiName,
                codeTransformSessionId: this.sessionId,
                codeTransformApiErrorMessage: errorMessage,
                codeTransformRequestId: e?.requestId ?? telemetryUndefined,
                codeTransformJobId: parameters.jobId ?? telemetryUndefined,
                result: MetadataResult.Fail,
                reason: parameters.errorReason,
            })
            throw e // pass along error to callee
        } finally {
            let uploadId = parameters.uploadId
            try {
                uploadId = (result as CreateUploadUrlResponse).uploadId
            } catch (_) {
                //noop
            }

            let requestId = telemetryUndefined
            try {
                requestId = (result as PromiseResult<GumbyAPIresponse, AWSError>).$response.requestId
            } catch (_) {
                // noop
            }

            telemetry.codeTransform_logApiLatency.emit({
                codeTransformApiNames: parameters.apiName,
                codeTransformSessionId: this.sessionId,
                codeTransformUploadId: uploadId,
                codeTransformRunTimeLatency: calculateTotalLatency(apiStartTime),
                codeTransformJobId: parameters.jobId,
                codeTransformTotalByteSize: parameters.uploadFileByteSize,
                codeTransformRequestId: requestId,
                result: MetadataResult.Pass,
            })
        }
    }
}
