/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 *
 * This class contains helper methods dedicated to logging metrics specific to
 * CodeTransform
 */

import { telemetry } from '../../shared/telemetry/telemetry'
import { JDKVersion } from '../../codewhisperer/models/model'
import * as CodeWhispererConstants from '../../codewhisperer/models/constants'
import { codeTransformTelemetryState } from './codeTransformTelemetryState'

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
        })
    } else if (source === StartActionPositions.BottomHubPanel) {
        telemetry.codeTransform_isDoubleClickedToTriggerUserModal.emit({
            codeTransformStartSrcComponents: StartActionPositions.BottomHubPanel,
            ...commonMetrics,
        })
    }
}

//TODO: it would be better to expand JDKVersion from an enum to a class
export const toJDKMetricValue = (source: JDKVersion): string => {
    switch (source) {
        case JDKVersion.JDK8:
            return 'jdk8'
        case JDKVersion.JDK11:
            return 'jdk11'
        case JDKVersion.JDK17:
            return 'jdk17'
        default:
            return ''
    }
}

export const calculateTotalLatency = (startTime: number, endTime: number = Date.now()): number => endTime - startTime
