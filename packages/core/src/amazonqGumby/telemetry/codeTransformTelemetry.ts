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
    telemetry,
} from '../../shared/telemetry/telemetry'
import { JDKVersion } from '../../codewhisperer/models/model'
import * as CodeWhispererConstants from '../../codewhisperer/models/constants'
import { codeTransformTelemetryState } from './codeTransformTelemetryState'
import { MetadataResult } from '../../shared/telemetry/telemetryClient'

export const telemetryUndefined = 'undefined'

export enum CancelActionPositions {
    ApiError = 'apiError',
    LoadingPanel = 'loadingPanelStopButton',
    DevToolsSidePanel = 'devToolsStopButton',
    BottomHubPanel = 'bottomPanelSideNavButton',
    Chat = 'qChatPanel',
}

export enum StartActionPositions {
    DevToolsSidePanel = 'devToolsStartButton',
    BottomHubPanel = 'bottomPanelSideNavButton',
    Chat = 'qChatPanel',
}

export const logCodeTransformInitiatedMetric = (source: string): void => {
    const commonMetrics = {
        codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
    }

    if (source === CodeWhispererConstants.transformTreeNode) {
        telemetry.codeTransform_isDoubleClickedToTriggerUserModal.emit({
            codeTransformStartSrcComponents: StartActionPositions.DevToolsSidePanel,
            ...commonMetrics,
            result: MetadataResult.Pass,
        })
    } else if (source === StartActionPositions.BottomHubPanel) {
        telemetry.codeTransform_isDoubleClickedToTriggerUserModal.emit({
            codeTransformStartSrcComponents: StartActionPositions.BottomHubPanel,
            ...commonMetrics,
            result: MetadataResult.Pass,
        })
    } else if (source === StartActionPositions.ChatPrompt) {
        telemetry.codeTransform_jobIsStartedFromChatPrompt.emit({
            ...commonMetrics,
            result: MetadataResult.Pass,
        })
    }
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

export const calculateTotalLatency = (startTime: number, endTime: number = Date.now()): number => endTime - startTime
