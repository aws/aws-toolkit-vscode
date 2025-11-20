/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExtensionContext, env, Uri, window } from 'vscode'
import { CloudFormationTelemetrySettings } from './extensionConfig'
import { commandKey } from './utils'
import { isAutomation } from '../../shared/vscode/env'
import { getLogger } from '../../shared/logger/logger'

enum TelemetryChoice {
    Allow = 'Yes, Allow',
    Later = 'Not Now',
    Never = 'Never',
    LearnMore = 'Learn More',
}

const telemetryKeys = {
    hasResponded: commandKey('telemetry.hasResponded'),
    lastPromptDate: commandKey('telemetry.lastPromptDate'),
    unpersistedResponse: commandKey('telemetry.unpersistedResponse'),
} as const

const telemetrySettings = {
    enabled: 'enabled',
} as const

const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000
const promptTimeoutMs = 2500
const telemetryDocsUrl = 'https://github.com/aws-cloudformation/cloudformation-languageserver/tree/main/src/telemetry'

/* eslint-disable aws-toolkits/no-banned-usages */
export async function handleTelemetryOptIn(
    context: ExtensionContext,
    cfnTelemetrySettings: CloudFormationTelemetrySettings
): Promise<boolean> {
    // If previous choice failed to persist, persist it now and return
    const unpersistedResponse = (await context.globalState.get(telemetryKeys.unpersistedResponse)) as string
    const lastPromptDate = context.globalState.get<number>(telemetryKeys.lastPromptDate, Date.now())
    if (unpersistedResponse) {
        await saveTelemetryResponse(unpersistedResponse, context, cfnTelemetrySettings, lastPromptDate)
        await context.globalState.update(telemetryKeys.unpersistedResponse, undefined)
        return unpersistedResponse === TelemetryChoice.Allow.toString() ? true : false
    }

    // Never throws because we provide a default
    const telemetryEnabled = cfnTelemetrySettings.get(telemetrySettings.enabled, false)

    if (isAutomation()) {
        return telemetryEnabled
    }

    // If user has permanently responded, use their choice
    const hasResponded = context.globalState.get<boolean>(telemetryKeys.hasResponded, false)
    if (hasResponded) {
        return telemetryEnabled
    }

    // Check if we should show reminder (30 days since last prompt)
    const shouldPrompt = lastPromptDate === 0 || Date.now() - lastPromptDate >= thirtyDaysMs
    if (!shouldPrompt) {
        return telemetryEnabled
    }

    // Show prompt but set false if timeout
    const promptPromise = promptTelemetryOptIn(context, cfnTelemetrySettings)
    const timeoutPromise = new Promise<false>((resolve) => setTimeout(() => resolve(false), promptTimeoutMs))
    const result = await Promise.race([promptPromise, timeoutPromise])

    // Keep prompt alive in background
    void promptPromise

    return result
}

/* eslint-disable aws-toolkits/no-banned-usages */
async function saveTelemetryResponse(
    response: string | undefined,
    context: ExtensionContext,
    cfnTelemetrySettings: CloudFormationTelemetrySettings,
    promptDate: number
): Promise<void> {
    if (response === TelemetryChoice.Allow) {
        await cfnTelemetrySettings.update(telemetrySettings.enabled, true)
        await context.globalState.update(telemetryKeys.hasResponded, true)
    } else if (response === TelemetryChoice.Never) {
        await cfnTelemetrySettings.update(telemetrySettings.enabled, false)
        await context.globalState.update(telemetryKeys.hasResponded, true)
    } else if (response === TelemetryChoice.Later) {
        await cfnTelemetrySettings.update(telemetrySettings.enabled, false)
        await context.globalState.update(telemetryKeys.lastPromptDate, promptDate)
    }
}

/* eslint-disable aws-toolkits/no-banned-usages */
async function promptTelemetryOptIn(
    context: ExtensionContext,
    cfnTelemetrySettings: CloudFormationTelemetrySettings
): Promise<boolean> {
    const message =
        'Help us improve the AWS CloudFormation Language Server by sharing anonymous telemetry data with AWS. You can change this preference at any time in aws.cloudformation Settings.'

    const response = await window.showInformationMessage(
        message,
        TelemetryChoice.Allow,
        TelemetryChoice.Later,
        TelemetryChoice.Never,
        TelemetryChoice.LearnMore
    )

    if (response === TelemetryChoice.LearnMore) {
        await env.openExternal(Uri.parse(telemetryDocsUrl))
        return promptTelemetryOptIn(context, cfnTelemetrySettings)
    }

    // There's a chance our settings aren't registered yet from package.json, so we
    // see if we can persist to settings first
    try {
        // Throws if setting is not registered
        cfnTelemetrySettings.get(telemetrySettings.enabled)
    } catch (err) {
        getLogger().warn(err as Error)
        // Save the choice in globalState and save to settings next time
        await context.globalState.update(telemetryKeys.unpersistedResponse, response)
        if (response === TelemetryChoice.Allow) {
            await context.globalState.update(telemetryKeys.hasResponded, true)
            return true
        } else if (response === TelemetryChoice.Never) {
            await context.globalState.update(telemetryKeys.hasResponded, true)
            return false
        } else {
            return false
        }
    }

    // At this point should be able to save and get successfully
    await saveTelemetryResponse(response, context, cfnTelemetrySettings, Date.now())
    return cfnTelemetrySettings.get(telemetrySettings.enabled, false)
}
