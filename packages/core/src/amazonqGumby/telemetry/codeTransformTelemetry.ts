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
} from '../../shared/telemetry/telemetry'
import { JDKVersion } from '../../codewhisperer/models/model'
import globals from '../../shared/extensionGlobals'

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

export const calculateTotalLatency = (startTime: number): number => globals.clock.Date.now() - startTime
