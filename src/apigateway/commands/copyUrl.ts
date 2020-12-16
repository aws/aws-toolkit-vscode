/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Window } from '../../shared/vscode/window'
import { Env } from '../../shared/vscode/env'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { RestApiNode } from '../explorer/apiNodes'
import * as picker from '../../shared/ui/picker'
import * as vscode from 'vscode'
import { ProgressLocation } from 'vscode'
import { ext } from '../../shared/extensionGlobals'
import { Stage } from 'aws-sdk/clients/apigateway'
import { ApiGatewayClient } from '../../shared/clients/apiGatewayClient'
import { RegionProvider } from '../../shared/regions/regionProvider'
import { DEFAULT_DNS_SUFFIX } from '../../shared/regions/regionUtilities'
import { COPY_TO_CLIPBOARD_INFO_TIMEOUT_MS } from '../../shared/constants'
import { getLogger } from '../../shared/logger'
import { recordApigatewayCopyUrl } from '../../shared/telemetry/telemetry'
import { addCodiconToString } from '../../shared/utilities/textUtilities'

interface StageInvokeUrlQuickPick extends vscode.QuickPickItem {
    // override declaration so this can't be undefined
    detail: string
}

export async function copyUrlCommand(
    node: RestApiNode,
    regionProvider: RegionProvider,
    window = Window.vscode(),
    env = Env.vscode()
): Promise<void> {
    const region = node.regionCode
    const dnsSuffix = regionProvider.getDnsSuffixForRegion(region) || DEFAULT_DNS_SUFFIX
    const client: ApiGatewayClient = ext.toolkitClientBuilder.createApiGatewayClient(region)

    let stages: Stage[]
    try {
        stages = await window.withProgress(
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
        getLogger().error(`Failed to load stages: %O`, e)
        recordApigatewayCopyUrl({ result: 'Failed' })
        return
    }

    const quickPickItems = stages.map<StageInvokeUrlQuickPick>(stage => ({
        label: stage.stageName!!,
        detail: buildDefaultApiInvokeUrl(node.id, region, dnsSuffix, stage.stageName!!),
    }))

    if (quickPickItems.length === 0) {
        window.showInformationMessage(
            localize('AWS.apig.copyUrlNoStages', "Failed to copy URL because '{0}' has no stages", node.name)
        )
        recordApigatewayCopyUrl({ result: 'Failed' })
        return
    } else if (quickPickItems.length === 1) {
        const url = quickPickItems[0].detail
        await copyUrl(window, env, url)
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
        recordApigatewayCopyUrl({ result: 'Cancelled' })
        return
    }

    const url = pickerResponse.detail
    await copyUrl(window, env, url)
}

export function buildDefaultApiInvokeUrl(apiId: string, region: string, dnsSuffix: string, stage: string): string {
    return `https://${apiId}.execute-api.${region}.${dnsSuffix}/${stage}`
}

async function copyUrl(window: Window, env: Env, url: string) {
    await env.clipboard.writeText(url)
    window.setStatusBarMessage(
        addCodiconToString(
            'clippy',
            `${localize('AWS.explorerNode.copiedToClipboard', 'Copied {0} to clipboard', 'URL')}: ${url}`
        ),
        COPY_TO_CLIPBOARD_INFO_TIMEOUT_MS
    )

    recordApigatewayCopyUrl({ result: 'Succeeded' })
}
