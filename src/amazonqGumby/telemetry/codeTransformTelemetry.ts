/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 *
 * This class contains helper methods dedicated to logging metrics specific to
 * CodeTransform
 */

import { CodeTransformStartSrcComponents, telemetry } from '../../shared/telemetry/telemetry'
import { JDKVersion } from '../../codewhisperer/models/model'
import * as CodeWhispererConstants from '../../codewhisperer/models/constants'
import { codeTransformTelemetryState } from './codeTransformTelemetryState'

export const SidePanelTransformTreeNode = 'devToolsStartButton'
export const HubStartButton = 'bottomPanelSideNavButton'

export const logCodeTransformInitiatedMetric = (source: string): void => {
    const commonMetrics = {
        codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
    }

    if (source === CodeWhispererConstants.transformTreeNode) {
        telemetry.codeTransform_isDoubleClickedToTriggerUserModal.emit({
            codeTransformStartSrcComponents: SidePanelTransformTreeNode as CodeTransformStartSrcComponents,
            ...commonMetrics,
        })
    } else if (source === HubStartButton) {
        telemetry.codeTransform_isDoubleClickedToTriggerUserModal.emit({
            codeTransformStartSrcComponents: HubStartButton as CodeTransformStartSrcComponents,
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
