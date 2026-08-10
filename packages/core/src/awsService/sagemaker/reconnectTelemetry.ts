/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { telemetry } from '../../shared/telemetry/telemetry'
import { Result } from '../../shared/telemetry/telemetry.gen'

/** Emits `sagemaker_reconnect` from the extension host (detached server has no vscode context). */
export function emitReconnectMetric(opts: {
    result: Result
    isSmus: boolean
    duration?: number
    reason?: string
}): void {
    telemetry.sagemaker_reconnect.emit({
        result: opts.result,
        isSmus: opts.isSmus,
        duration: opts.duration,
        reason: opts.reason,
    })
}
