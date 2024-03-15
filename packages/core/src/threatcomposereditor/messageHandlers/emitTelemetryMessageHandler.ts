/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ThreatcomposerError, telemetry } from '../../shared/telemetry/telemetry'

export function sendThreatComposerErrored(metadata: ThreatcomposerError) {
    telemetry.threatcomposer_error.emit({
        result: metadata.result ?? 'Succeeded',
        reason: metadata.reason ?? '',
    })
}
