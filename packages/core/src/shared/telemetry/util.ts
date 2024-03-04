/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
import { mapMetadata } from './telemetryLogger'
import { Result } from './telemetry.gen'
import { MetricDatum } from './clienttelemetry'
import { isValidationExemptMetric } from './exemptMetrics'
import { isCloud9, isSageMaker } from '../../shared/extensionUtilities'
import { isInDevEnv } from '../../codecatalyst/utils'

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

export const platformPair = () => `${env.appName.replace(/\s/g, '-')}/${version}`

/**
 * Returns a string that should be used as the extension's user agent.
 *
 * Omits the platform and `ClientId` pairs by default.
 */
export async function getUserAgent(
    opt?: { includePlatform?: boolean; includeClientId?: boolean },
    globalState = globals.context.globalState
): Promise<string> {
    const pairs = [`AWS-Toolkit-For-VSCode/${extensionVersion}`]

    if (opt?.includePlatform) {
        pairs.push(platformPair())
    }

    if (opt?.includeClientId) {
        const clientId = await getClientId(globalState)
        pairs.push(`ClientId/${clientId}`)
    }

    return pairs.join(' ')
}

type EnvType = 'cloud9' | 'cloud9-codecatalyst' | 'codecatalyst' | 'local' | 'ec2' | 'sagemaker' | 'test' | 'wsl' |'unknown'

export function getComputeEnvType(): EnvType {
    if (isCloud9('classic')) {
        return 'cloud9'
    } else if (isCloud9('codecatalyst')) {
        return 'cloud9-codecatalyst'
    } else if (isInDevEnv()) {
        return 'codecatalyst'
    } else if (isSageMaker()) {
        return 'sagemaker'
    } else if (env.remoteName === 'ssh-remote' && !isInDevEnv()) {
        return 'ec2'
    } else if (env.remoteName) {
        return 'wsl'
    } else if (isAutomation()) {
        return 'test'
    } else if (!env.remoteName) {
        return 'local'
    } else {
        return 'unknown'
    }
}

/**
 * Validates that emitted telemetry metrics
 * 1. contain a result property and
 * 2. contain a reason propery if result = 'Failed'.
 */
export function validateMetricEvent(event: MetricDatum, fatal: boolean) {
    const failedStr: Result = 'Failed'
    const telemetryRunDocsStr =
        ' Consider using `.run()` instead of `.emit()`, which will set these properties automatically. ' +
        'See https://github.com/aws/aws-toolkit-vscode/blob/master/docs/telemetry.md#guidelines'

    if (!isValidationExemptMetric(event.MetricName) && event.Metadata) {
        const metadata = mapMetadata([])(event.Metadata)
        let msg = 'telemetry: invalid Metric: '

        if (metadata.result === undefined) {
            msg += `"${event.MetricName}" emitted without the \`result\` property, which is always required.`
        } else if (metadata.result === failedStr && metadata.reason === undefined) {
            msg += `"${event.MetricName}" emitted with result=Failed but without the \`reason\` property.`
        } else {
            return // Validation passed.
        }

        msg += telemetryRunDocsStr
        if (fatal) {
            throw new Error(msg)
        }
        getLogger().warn(msg)
    }
}
