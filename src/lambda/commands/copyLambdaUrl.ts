/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { DefaultLambdaClient, LambdaClient } from '../../shared/clients/lambdaClient'
import { LambdaFunctionNode } from '../explorer/lambdaFunctionNode'
import globals from '../../shared/extensionGlobals'
import { copyToClipboard } from '../../shared/utilities/messages'
import { addCodiconToString } from '../../shared/utilities/textUtilities'
import { createQuickPick, QuickPickPrompter } from '../../shared/ui/pickerPrompter'
import { isValidResponse } from '../../shared/wizards/wizard'
import { FunctionUrlConfigList } from 'aws-sdk/clients/lambda'
import { createUrlForLambdaFunctionUrl } from '../../shared/constants'

export async function copyLambdaUrl(
    node: LambdaFunctionNode,
    client: LambdaClient = new DefaultLambdaClient(node.regionCode),
    quickPickUrl = _quickPickUrl
): Promise<void> {
    const configs = await client.getFunctionUrlConfigs(node.name)

    if (configs.length == 0) {
        globals.window.showWarningMessage(
            `No URL for Lambda function. [How to create URL.](${createUrlForLambdaFunctionUrl})`
        )
        globals.window.setStatusBarMessage(addCodiconToString('circle-slash', 'No URL for Lambda function.'), 5000)
    } else {
        let url: string | undefined = undefined
        if (configs.length > 1) {
            url = await quickPickUrl(configs)
        } else {
            url = configs[0].FunctionUrl
        }

        if (url) {
            copyToClipboard(url, 'URL')
        }
    }
}

async function _quickPickUrl(configList: FunctionUrlConfigList): Promise<string | undefined> {
    const items = configList.map(c => ({
        label: c.FunctionArn,
        data: c.FunctionUrl,
    }))
    const picker: QuickPickPrompter<string> = createQuickPick(items, { title: 'Select function to copy url from.' })
    const res = await picker.prompt()
    return isValidResponse(res) ? res : undefined
}
