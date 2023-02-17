/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { env, Memento, version } from 'vscode'
import { getLogger } from '../logger'
import { fromExtensionManifest } from '../settings'
import { shared } from '../utilities/functionUtils'
import { extensionVersion, isAutomation } from '../vscode/env'
import { v4 as uuidv4 } from 'uuid'
import { addTypeName } from '../utilities/typeConstructors'
import globals from '../extensionGlobals'

const legacySettingsTelemetryValueDisable = 'Disable'
const legacySettingsTelemetryValueEnable = 'Enable'

const TelemetryFlag = addTypeName('boolean', convertLegacy)

export class TelemetryConfig extends fromExtensionManifest('aws', { telemetry: TelemetryFlag }) {
    public isEnabled(): boolean {
        return this.get('telemetry', true)
    }
}

export function convertLegacy(value: unknown): boolean {
    if (typeof value === 'boolean') {
        return value
    }

    // Set telemetry value to boolean if the current value matches the legacy value
    if (value === legacySettingsTelemetryValueDisable) {
        return false
    } else if (value === legacySettingsTelemetryValueEnable) {
        return true
    } else {
        throw new TypeError(`Unknown telemetry setting: ${value}`)
    }
}

export const getClientId = shared(
    async (globalState: Memento, isTelemetryEnabled = new TelemetryConfig().isEnabled(), isTest?: false) => {
        if (isTest ?? isAutomation()) {
            return 'ffffffff-ffff-ffff-ffff-ffffffffffff'
        }
        if (!isTelemetryEnabled) {
            return '11111111-1111-1111-1111-111111111111'
        }
        try {
            let clientId = globalState.get<string>('telemetryClientId')
            if (!clientId) {
                clientId = uuidv4()
                await globalState.update('telemetryClientId', clientId)
            }
            return clientId
        } catch (error) {
            const clientId = '00000000-0000-0000-0000-000000000000'
            getLogger().error('Could not create a client id. Reason: %O ', error)
            return clientId
        }
    }
)

/**
 * Returns a string that should be used as the extension's user agent.
 *
 * Omits the `ClientId` pair by default.
 */
export async function getUserAgent(
    opt?: { includeClientId?: boolean },
    globalState = globals.context.globalState
): Promise<string> {
    const platformName = env.appName.replace(/\s/g, '-')
    const pairs = [`AWS-Toolkit-For-VSCode/${extensionVersion}`, `${platformName}/${version}`]

    if (opt?.includeClientId) {
        const clientId = await getClientId(globalState)
        pairs.push(`ClientId/${clientId}`)
    }

    return pairs.join(' ')
}
