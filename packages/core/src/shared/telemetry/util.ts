/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { env, Memento, version } from 'vscode'
import { getLogger } from '../logger'
import { fromExtensionManifest, migrateSetting } from '../settings'
import { shared } from '../utilities/functionUtils'
import { isInDevEnv, extensionVersion, isAutomation } from '../vscode/env'
import { addTypeName } from '../utilities/typeConstructors'
import globals, { isWeb } from '../extensionGlobals'
import { mapMetadata } from './telemetryLogger'
import { Result } from './telemetry.gen'
import { MetricDatum } from './clienttelemetry'
import { isValidationExemptMetric } from './exemptMetrics'
import { isCloud9, isSageMaker } from '../../shared/extensionUtilities'
import { isExtensionInstalled, VSCODE_EXTENSION_ID } from '../utilities'
import { randomUUID } from '../../common/crypto'
import { activateExtension } from '../utilities/vsCodeUtils'
const legacySettingsTelemetryValueDisable = 'Disable'
const legacySettingsTelemetryValueEnable = 'Enable'

const TelemetryFlag = addTypeName('boolean', convertLegacy)
const telemetryClientIdGlobalStatekey = 'telemetryClientId'
const telemetryClientIdEnvKey = '__TELEMETRY_CLIENT_ID'

export class TelemetryConfig extends fromExtensionManifest('aws', {
    telemetry: TelemetryFlag,
    'amazonQ.telemetry': TelemetryFlag,
}) {
    private readonly amazonQSettingMigratedKey = 'aws.amazonq.telemetry.migrated'

    public isEnabled(): boolean {
        if (globals.context.extension.id === VSCODE_EXTENSION_ID.amazonq) {
            return this.get(`amazonQ.telemetry`, true)
        }
        return this.get(`telemetry`, true)
    }

    public async initAmazonQSetting() {
        if (globals.context.globalState.get<boolean>(this.amazonQSettingMigratedKey)) {
            return
        }
        // aws.telemetry isn't deprecated, we are just initializing aws.amazonQ.telemetry with its value
        await migrateSetting({ key: 'aws.telemetry', type: Boolean }, { key: 'aws.amazonQ.telemetry' })
        await globals.context.globalState.update(this.amazonQSettingMigratedKey, true)
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
            let clientId = globalState.get<string>(telemetryClientIdGlobalStatekey)
            if (!clientId) {
                clientId = randomUUID()
                await globalState.update(telemetryClientIdGlobalStatekey, clientId)
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
    const pairs =
        globals.context.extension.id === VSCODE_EXTENSION_ID.amazonq
            ? [`AmazonQ-For-VSCode/${extensionVersion}`]
            : [`AWS-Toolkit-For-VSCode/${extensionVersion}`]

    if (opt?.includePlatform) {
        pairs.push(platformPair())
    }

    if (opt?.includeClientId) {
        const clientId = await getClientId(globalState)
        pairs.push(`ClientId/${clientId}`)
    }

    return pairs.join(' ')
}

type EnvType =
    | 'cloud9'
    | 'cloud9-codecatalyst'
    | 'codecatalyst'
    | 'local'
    | 'ec2'
    | 'sagemaker'
    | 'test'
    | 'wsl'
    | 'unknown'

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

/**
 * Setup the telemetry client id at extension activation.
 * This function is designed to let AWS Toolkit and Amazon Q share
 * the same telemetry client id.
 */

export async function setupTelemetryId(extensionContext: vscode.ExtensionContext) {
    try {
        if (isWeb()) {
            await globals.context.globalState.update(telemetryClientIdGlobalStatekey, vscode.env.machineId)
        } else {
            const currentClientId = globals.context.globalState.get<string>(telemetryClientIdGlobalStatekey)
            const storedClientId = process.env[telemetryClientIdEnvKey]
            if (currentClientId && storedClientId) {
                if (extensionContext.extension.id === VSCODE_EXTENSION_ID.awstoolkit) {
                    getLogger().debug(`telemetry: Store telemetry client id to env ${currentClientId}`)
                    process.env[telemetryClientIdEnvKey] = currentClientId
                    // notify amazon q to use this stored client id
                    // if amazon q activates first. Do not block on activate amazon q
                    if (isExtensionInstalled(VSCODE_EXTENSION_ID.amazonq)) {
                        void activateExtension(VSCODE_EXTENSION_ID.amazonq).then(async () => {
                            getLogger().debug(`telemetry: notifying Amazon Q to adopt client id ${currentClientId}`)
                            await vscode.commands.executeCommand('aws.amazonq.setupTelemetryId')
                        })
                    }
                } else if (extensionContext.extension.id === VSCODE_EXTENSION_ID.amazonq) {
                    getLogger().debug(`telemetry: Set telemetry client id to ${storedClientId}`)
                    await globals.context.globalState.update(telemetryClientIdGlobalStatekey, storedClientId)
                } else {
                    getLogger().error(`Unexpected extension id ${extensionContext.extension.id}`)
                }
            } else if (!currentClientId && storedClientId) {
                getLogger().debug(`telemetry: Write telemetry client id to global state ${storedClientId}`)
                await globals.context.globalState.update(telemetryClientIdGlobalStatekey, storedClientId)
            } else if (currentClientId && !storedClientId) {
                getLogger().debug(`telemetry: Write telemetry client id to env ${currentClientId}`)
                process.env[telemetryClientIdEnvKey] = currentClientId
            } else {
                const clientId = randomUUID()
                getLogger().debug(`telemetry: Setup telemetry client id ${clientId}`)
                await globals.context.globalState.update(telemetryClientIdGlobalStatekey, clientId)
                process.env[telemetryClientIdEnvKey] = clientId
            }
        }
    } catch (err) {
        getLogger().error(`Erro while setting up telemetry id ${err}`)
    }
}

/**
 * Potentially helpful values for the 'source' field in telemetry.
 */
export const ExtStartUpSources = {
    firstStartUp: 'firstStartUp',
    update: 'update',
    reload: 'reload',
    none: 'none',
} as const

export type ExtStartUpSource = (typeof ExtStartUpSources)[keyof typeof ExtStartUpSources]
