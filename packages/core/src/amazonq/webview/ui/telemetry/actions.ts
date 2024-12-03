/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExtensionMessage } from '../commands'
import { TabType } from '../storages/tabsStorage'

export function createClickTelemetry(source: string): ExtensionMessage {
    return {
        command: 'send-telemetry',
        source,
    }
}
export function isClickTelemetry(message: ExtensionMessage): boolean {
    return (
        message.command === 'send-telemetry' && typeof message.source === 'string' && Object.keys(message).length === 2
    )
}

export function createOpenAgentTelemetry(module: TabType, trigger: Trigger): ExtensionMessage {
    return {
        command: 'send-telemetry',
        module,
        trigger,
    }
}

export type Trigger = 'right-click' | 'quick-action' | 'quick-start'

export function isOpenAgentTelemetry(message: ExtensionMessage): boolean {
    return (
        message.command === 'send-telemetry' &&
        typeof message.module === 'string' &&
        typeof message.trigger === 'string' &&
        Object.keys(message).length === 3
    )
}
