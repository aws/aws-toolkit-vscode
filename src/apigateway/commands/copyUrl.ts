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
import { ext } from '../../shared/extensionGlobals'
import { Stage } from 'aws-sdk/clients/apigateway'
import { ApiGatewayClient } from '../../shared/clients/apiGatewayClient'
import { RegionProvider } from '../../shared/regions/regionProvider'
import { DEFAULT_DNS_SUFFIX } from '../../shared/regions/regionUtilities'

const COPY_URL_DISPLAY_TIMEOUT_MS = 2000

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

    const stages: Stage[] = (await client.getStages(node.id)).item || []
    const quickPickItems = stages.map<StageInvokeUrlQuickPick>(stage => ({
        label: stage.stageName!!,
        detail: buildDefaultApiInvokeUrl(node.id, region, dnsSuffix, stage.stageName!!),
    }))

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
        return
    }

    await env.clipboard.writeText(pickerResponse.detail)

    window.setStatusBarMessage(
        localize('AWS.explorerNode.copiedToClipboard', '$(clippy) Copied {0} to clipboard', 'name'),
        COPY_URL_DISPLAY_TIMEOUT_MS
    )
}

export function buildDefaultApiInvokeUrl(apiId: string, region: string, dnsSuffix: string, stage: string): string {
    return `https://${apiId}.execute-api.${region}.${dnsSuffix}/${stage}`
}
