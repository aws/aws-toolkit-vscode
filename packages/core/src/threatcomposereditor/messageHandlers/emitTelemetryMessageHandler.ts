/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ThreatcomposerClosed, ThreatcomposerError, telemetry } from '../../shared/telemetry/telemetry'

export function sendThreatComposerErrored(metadata: ThreatcomposerError) {
    telemetry.threatcomposer_error.emit({
        result: metadata.result ?? 'Succeeded',
        reason: metadata.reason ?? '',
        id: metadata.id,
    })
}

export function sendThreatComposerOpenCancelled(metadata: ThreatcomposerClosed) {
    telemetry.threatcomposer_closed.emit({
        result: metadata.result ?? 'Succeeded',
        reason: metadata.reason ?? '',
        id: metadata.id,
    })
}
