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
import { CodeTransformConstants } from '../constants'

export class CodeTransformTelemetry {
    public static SidePanelTransformTreeNode = 'devToolsStartButton'
    public static HubStartButton = 'bottomPanelSideNavButton'

    static logCodeTransformInitiatedMetric(source: string): void {
        const commonMetrics = {
            codeTransformSessionId: codeTransformTelemetryState.getSessionId(),
        }

        if (source === CodeWhispererConstants.transformTreeNode) {
            telemetry.codeTransform_isDoubleClickedToTriggerUserModal.emit({
                codeTransformStartSrcComponents:
                    CodeTransformTelemetry.SidePanelTransformTreeNode as CodeTransformStartSrcComponents,
                ...commonMetrics,
            })
        } else if (source === CodeTransformConstants.HubStartButton) {
            telemetry.codeTransform_isDoubleClickedToTriggerUserModal.emit({
                codeTransformStartSrcComponents:
                    CodeTransformTelemetry.HubStartButton as CodeTransformStartSrcComponents,
                ...commonMetrics,
            })
        }

        // todo: log metric for started from transform command
    }

    //TODO: it would be better to expand JDKVersion from an enum to a class,
    //but it's faster to do this for now
    static toJDKMetricValue(source: JDKVersion): string {
        switch (source) {
            case JDKVersion.JDK8:
                return 'jdk8'
            case JDKVersion.JDK11:
                return 'jdk11'
            case JDKVersion.JDK17:
                return 'jdk17'
        }
        return ''
    }
}

export const calculateTotalLatency = (startTime: number, endTime: number = Date.now()): number => endTime - startTime
