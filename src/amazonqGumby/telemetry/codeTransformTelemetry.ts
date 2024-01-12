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

export enum CancelActionPositions {
    ApiError = 'apiError',
    LoadingPanel = 'loadingPanelStopButton',
    DevToolsSidePanel = 'devToolsStopButton',
    BottomHubPanel = 'bottomPanelSideNavButton',
}

export enum StartActionPositions {
    DevToolsSidePanel = 'devToolsStartButton',
    BottomHubPanel = 'bottomPanelSideNavButton',
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
    }
}

export const JDKToTelemetryValue = (
    source: JDKVersion
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

export const calculateTotalLatency = (startTime: number, endTime: number = Date.now()): number => endTime - startTime
