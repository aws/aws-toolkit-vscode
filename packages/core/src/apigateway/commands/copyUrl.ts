/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { copyToClipboard } from '../../shared/utilities/messages'
import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()
import { RestApiNode } from '../explorer/apiNodes'
import * as picker from '../../shared/ui/picker'
import * as vscode from 'vscode'
import { ProgressLocation } from 'vscode'

import { Stage } from 'aws-sdk/clients/apigateway'
import { DefaultApiGatewayClient } from '../../shared/clients/apiGatewayClient'
import { defaultDnsSuffix, RegionProvider } from '../../shared/regions/regionProvider'
import { getLogger } from '../../shared/logger'
import { telemetry } from '../../shared/telemetry/telemetry'

interface StageInvokeUrlQuickPick extends vscode.QuickPickItem {
    // override declaration so this can't be undefined
    detail: string
}

export async function copyUrlCommand(node: RestApiNode, regionProvider: RegionProvider): Promise<void> {
    const region = node.regionCode
    const dnsSuffix = regionProvider.getDnsSuffixForRegion(region) || defaultDnsSuffix
    const client = new DefaultApiGatewayClient(region)

    let stages: Stage[]
    try {
        stages = await vscode.window.withProgress(
            {
                cancellable: false,
                location: ProgressLocation.Window,
            },
            async progress => {
                progress.report({
                    message: localize('AWS.apig.loadingStages', 'Loading stage list for API: {0}', node.name),
                })
                return (await client.getStages(node.id)).item || []
            }
        )
    } catch (e) {
        getLogger().error(`Failed to load stages: %s`, e)
        telemetry.apigateway_copyUrl.emit({ result: 'Failed' })
        return
    }

    const quickPickItems = stages.map<StageInvokeUrlQuickPick>(stage => ({
        label: stage.stageName!,
        detail: buildDefaultApiInvokeUrl(node.id, region, dnsSuffix, stage.stageName!),
    }))

    if (quickPickItems.length === 0) {
        void vscode.window.showInformationMessage(
            localize('AWS.apig.copyUrlNoStages', "Failed to copy URL because '{0}' has no stages", node.name)
        )
        telemetry.apigateway_copyUrl.emit({ result: 'Failed' })
        return
    } else if (quickPickItems.length === 1) {
        const url = quickPickItems[0].detail
        await copyToClipboard(url, 'URL')
        telemetry.apigateway_copyUrl.emit({ result: 'Succeeded' })
        return
    }

    const quickPick = picker.createQuickPick({
        options: {
            ignoreFocusOut: true,
            title: localize('AWS.apig.selectStage', 'Select an API stage'),
        },
        items: quickPickItems,
    })

    const choices = await picker.promptUser({
        picker: quickPick,
        onDidTriggerButton: (button, resolve, reject) => {
            if (button === vscode.QuickInputButtons.Back) {
                resolve(undefined)
            }
        },
    })
    const pickerResponse = picker.verifySinglePickerOutput<StageInvokeUrlQuickPick>(choices)

    if (!pickerResponse) {
        telemetry.apigateway_copyUrl.emit({ result: 'Cancelled' })
        return
    }

    const url = pickerResponse.detail
    await copyToClipboard(url, 'URL')
    telemetry.apigateway_copyUrl.emit({ result: 'Succeeded' })
}

export function buildDefaultApiInvokeUrl(apiId: string, region: string, dnsSuffix: string, stage: string): string {
    return `https://${apiId}.execute-api.${region}.${dnsSuffix}/${stage}`
}
