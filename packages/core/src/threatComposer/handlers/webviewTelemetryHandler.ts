/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { telemetry, ThreatComposerClosed, ThreatComposerError } from '../../shared/telemetry/telemetry'

/**
 * Function to send an error occurred telemetry, for errors that have occurred
 * in the Threat Composer view.
 * @param metadata: Error metadata, including the error reason and result
 */
export function sendThreatComposerErrored(metadata: ThreatComposerError) {
    telemetry.threatComposer_error.emit({
        result: metadata.result ?? 'Succeeded',
        reason: metadata.reason ?? '',
        id: metadata.id,
    })
}

/**
 * Function to send a cancelled telemetry when the open action is cancelled by
 * the user. This is usually when Threat Composer takes longer than usual to open,
 * and the user has cancelled the open action.
 * @param metadata: Cancelled metadata, including the error reason and result
 */
export function sendThreatComposerOpenCancelled(metadata: ThreatComposerClosed) {
    telemetry.threatComposer_closed.emit({
        result: metadata.result ?? 'Succeeded',
        reason: metadata.reason ?? '',
        id: metadata.id,
    })
}
