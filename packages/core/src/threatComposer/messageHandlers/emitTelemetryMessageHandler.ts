/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { telemetry, ThreatComposerClosed, ThreatComposerError } from '../../shared/telemetry/telemetry'

export function sendThreatComposerErrored(metadata: ThreatComposerError) {
    telemetry.threatComposer_error.emit({
        result: metadata.result ?? 'Succeeded',
        reason: metadata.reason ?? '',
        id: metadata.id,
    })
}

export function sendThreatComposerOpenCancelled(metadata: ThreatComposerClosed) {
    telemetry.threatComposer_closed.emit({
        result: metadata.result ?? 'Succeeded',
        reason: metadata.reason ?? '',
        id: metadata.id,
    })
}
