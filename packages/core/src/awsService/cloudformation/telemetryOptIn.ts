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
    const hasResponded = context.globalState.get<boolean>(telemetryKeys.hasResponded)
    const lastPromptDate = context.globalState.get<number>(telemetryKeys.lastPromptDate)
    if (unpersistedResponse) {
        // May still raise popup if user lacks permission or file is corrupted
        const didSave = await saveTelemetryResponse(unpersistedResponse, cfnTelemetrySettings)
        await context.globalState.update(telemetryKeys.unpersistedResponse, undefined)
        // If we still couldn't save, clear everything so they get asked again until the file/perms is fixed
        if (!didSave) {
            getLogger().warn(
                'CloudFormation telemetry choice was not saved successfully after restart. Clearing related globalState keys for next restart'
            )
            await context.globalState.update(telemetryKeys.hasResponded, undefined)
            await context.globalState.update(telemetryKeys.lastPromptDate, undefined)
        }
        return logAndReturnTelemetryChoice(
            unpersistedResponse === TelemetryChoice.Allow.toString(),
            hasResponded,
            lastPromptDate
        )
    }

    // Never throws because we provide a default
    const telemetryEnabled = cfnTelemetrySettings.get(telemetrySettings.enabled, false)

    if (isAutomation()) {
        return logAndReturnTelemetryChoice(telemetryEnabled)
    }

    // If user has permanently responded, use their choice
    if (hasResponded) {
        return logAndReturnTelemetryChoice(telemetryEnabled, hasResponded)
    }

    // Check if we should show reminder (30 days since last prompt)
    const shouldPrompt = lastPromptDate === undefined || Date.now() - lastPromptDate >= thirtyDaysMs
    if (!shouldPrompt) {
        return logAndReturnTelemetryChoice(telemetryEnabled, hasResponded, lastPromptDate)
    }

    // Show prompt but set false if timeout
    const promptPromise = promptTelemetryOptIn(context, cfnTelemetrySettings)
    const timeoutPromise = new Promise<false>((resolve) => setTimeout(() => resolve(false), promptTimeoutMs))
    const result = await Promise.race([promptPromise, timeoutPromise])

    // Keep prompt alive in background
    void promptPromise

    return logAndReturnTelemetryChoice(result)
}
/**
 * Updates the telemetry setting. In case of error, the update calls do not throw.
 * They instead raise a popup and return false.
 *
 * @returns boolean whether the save/update was successful
 */
/* eslint-disable aws-toolkits/no-banned-usages */
async function saveTelemetryResponse(
    response: string | undefined,
    cfnTelemetrySettings: CloudFormationTelemetrySettings
): Promise<boolean> {
    if (response === TelemetryChoice.Allow) {
        return await cfnTelemetrySettings.update(telemetrySettings.enabled, true)
    } else if (response === TelemetryChoice.Never) {
        return await cfnTelemetrySettings.update(telemetrySettings.enabled, false)
    } else if (response === TelemetryChoice.Later) {
        return await cfnTelemetrySettings.update(telemetrySettings.enabled, false)
    }
    return false
}

function logAndReturnTelemetryChoice(choice: boolean, hasResponded?: boolean, lastPromptDate?: number): boolean {
    getLogger().info(
        'CloudFormation telemetry: choice=%s, hasResponded=%s, lastPromptDate=%s',
        choice,
        hasResponded,
        lastPromptDate
    )
    return choice
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

    const now = Date.now()
    await context.globalState.update(telemetryKeys.lastPromptDate, now)

    // There's a chance our settings aren't registered yet from package.json, so we
    // see if we can persist to settings first
    try {
        // Throws (with no popup) if setting is not registered
        cfnTelemetrySettings.get(telemetrySettings.enabled)
    } catch (err) {
        getLogger().warn(err as Error)
        // Save the choice in globalState and save to settings next time handleTelemetryOptIn is called
        await context.globalState.update(telemetryKeys.unpersistedResponse, response)
        if (response === TelemetryChoice.Allow) {
            await context.globalState.update(telemetryKeys.hasResponded, true)
            return true
        } else if (response === TelemetryChoice.Never) {
            await context.globalState.update(telemetryKeys.hasResponded, true)
            return false
        } else if (response === TelemetryChoice.Later) {
            return false
        }
    }

    // At this point should be able to save and get successfully
    await saveTelemetryResponse(response, cfnTelemetrySettings)
    await context.globalState.update(telemetryKeys.hasResponded, response !== TelemetryChoice.Later)
    return cfnTelemetrySettings.get(telemetrySettings.enabled, false)
}
