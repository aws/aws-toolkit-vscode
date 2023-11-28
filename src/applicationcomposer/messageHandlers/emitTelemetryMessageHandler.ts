/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { EmitTelemetryMessage } from '../types'
import { telemetry } from '../../shared/telemetry/telemetry'

export function emitTelemetryMessageHandler(message: EmitTelemetryMessage) {
    switch (message.eventType) {
        case 'GENERATE_CLICKED':
            telemetry.appcomposer_generateClicked.emit({
                result: 'Succeeded',
                resourceType: message.resourceId,
            })
            return
        case 'REGENERATE_CLICKED':
            telemetry.appcomposer_regenerateClicked.emit({
                result: 'Succeeded',
                resourceType: message.resourceId,
            })
            return
        case 'GENERATE_ACCEPTED':
            telemetry.appcomposer_generateAccepted.emit({
                result: 'Succeeded',
                resourceType: message.resourceId,
            })
            return
        case 'GENERATE_REJECTED':
            telemetry.appcomposer_generateRejected.emit({
                result: 'Succeeded',
                resourceType: message.resourceId,
            })
            return
    }
}
