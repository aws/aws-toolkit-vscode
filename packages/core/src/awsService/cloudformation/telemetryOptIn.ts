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

export async function promptTelemetryOptInWithTimeout(
    context: ExtensionContext,
    cfnTelemetrySettings: CloudFormationTelemetrySettings
): Promise<boolean> {
    const promptPromise = promptTelemetryOptIn(context, cfnTelemetrySettings)
    const timeoutPromise = new Promise<false>((resolve) => setTimeout(() => resolve(false), 2500))

    const result = await Promise.race([promptPromise, timeoutPromise])

    // Keep prompt alive in background
    void promptPromise

    return result
}

/* eslint-disable aws-toolkits/no-banned-usages */
async function handleTelemetryResponse(
    response: string | undefined,
    context: ExtensionContext,
    cfnTelemetrySettings: CloudFormationTelemetrySettings,
    promptDate: number
): Promise<void> {
    if (response === TelemetryChoice.Allow) {
        await cfnTelemetrySettings.update('enabled', true)
        await context.globalState.update(commandKey('telemetry.hasResponded'), true)
    } else if (response === TelemetryChoice.Never) {
        await cfnTelemetrySettings.update('enabled', false)
        await context.globalState.update(commandKey('telemetry.hasResponded'), true)
    } else if (response === TelemetryChoice.Later) {
        await cfnTelemetrySettings.update('enabled', false)
        await context.globalState.update(commandKey('telemetry.lastPromptDate'), promptDate)
    }
}

/* eslint-disable aws-toolkits/no-banned-usages */
async function promptTelemetryOptIn(
    context: ExtensionContext,
    cfnTelemetrySettings: CloudFormationTelemetrySettings
): Promise<boolean> {
    const now = Date.now()

    // If previous choice failed to persist, persist it now
    const unpersistedResponse = (await context.globalState.get(commandKey('telemetry.unpersistedResponse'))) as string
    const lastPromptDate = context.globalState.get<number>(commandKey('telemetry.lastPromptDate'), now)
    if (unpersistedResponse) {
        await handleTelemetryResponse(unpersistedResponse, context, cfnTelemetrySettings, lastPromptDate)
        await context.globalState.update(commandKey('telemetry.unpersistedResponse'), undefined)
        return unpersistedResponse === TelemetryChoice.Allow.toString() ? true : false
    }

    // Never throws because we provide a default
    const telemetryEnabled = cfnTelemetrySettings.get('enabled', false)
    if (isAutomation()) {
        return telemetryEnabled
    }

    const hasResponded = context.globalState.get<boolean>(commandKey('telemetry.hasResponded'), false)

    // If user has permanently responded, use their choice
    if (hasResponded) {
        return telemetryEnabled
    }

    // Check if we should show reminder (30 days since last prompt)
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000
    const shouldPrompt = lastPromptDate === 0 || now - lastPromptDate >= thirtyDaysMs
    if (!shouldPrompt) {
        return telemetryEnabled
    }

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
        await env.openExternal(
            Uri.parse('https://github.com/aws-cloudformation/cloudformation-languageserver/tree/main/src/telemetry')
        )
        return promptTelemetryOptIn(context, cfnTelemetrySettings)
    }

    // There's a chance our settings aren't registered yet, so we
    // see if we can persist to settings first
    try {
        // Throws if setting is not registered
        cfnTelemetrySettings.get('enabled')
    } catch (err) {
        getLogger().warn(err as Error)
        // Save the choice in globalState and save to settings next time
        await context.globalState.update(commandKey('telemetry.unpersistedResponse'), response)
        if (response === TelemetryChoice.Allow) {
            await context.globalState.update(commandKey('telemetry.hasResponded'), true)
            return true
        } else if (response === TelemetryChoice.Never) {
            await context.globalState.update(commandKey('telemetry.hasResponded'), true)
            return false
        } else {
            return false
        }
    }

    // At this point should be able to save and get successfully
    await handleTelemetryResponse(response, context, cfnTelemetrySettings, now)
    return cfnTelemetrySettings.get('enabled', false)
}
