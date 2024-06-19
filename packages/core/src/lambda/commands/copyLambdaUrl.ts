/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { DefaultLambdaClient, LambdaClient } from '../../shared/clients/lambdaClient'
import { LambdaFunctionNode } from '../explorer/lambdaFunctionNode'
import { copyToClipboard } from '../../shared/utilities/messages'
import { addCodiconToString } from '../../shared/utilities/textUtilities'
import { createQuickPick, QuickPickPrompter } from '../../shared/ui/pickerPrompter'
import { isValidResponse } from '../../shared/wizards/wizard'
import { FunctionUrlConfigList } from 'aws-sdk/clients/lambda'
import { CancellationError } from '../../shared/utilities/timeoutUtils'
import { lambdaFunctionUrlConfigUrl } from '../../shared/constants'

export const noLambdaFuncMessage = `No URL for Lambda function. [How to create URL.](${lambdaFunctionUrlConfigUrl})`

export async function copyLambdaUrl(
    node: Pick<LambdaFunctionNode, 'name' | 'regionCode'>,
    client: LambdaClient = new DefaultLambdaClient(node.regionCode),
    quickPickUrl = _quickPickUrl
): Promise<void> {
    const configs = await client.getFunctionUrlConfigs(node.name)

    if (configs.length === 0) {
        void vscode.window.showWarningMessage(noLambdaFuncMessage)
        vscode.window.setStatusBarMessage(addCodiconToString('circle-slash', 'No URL for Lambda function.'), 5000)
    } else {
        let url: string | undefined = undefined
        if (configs.length > 1) {
            url = await quickPickUrl(configs)
        } else {
            url = configs[0].FunctionUrl
        }

        if (url) {
            await copyToClipboard(url, 'URL')
        }
    }
}

async function _quickPickUrl(configList: FunctionUrlConfigList): Promise<string | undefined> {
    const res = await createLambdaFuncUrlPrompter(configList).prompt()
    if (!isValidResponse(res)) {
        throw new CancellationError('user')
    }
    return res
}

export function createLambdaFuncUrlPrompter(configList: FunctionUrlConfigList): QuickPickPrompter<string> {
    const items = configList.map(c => ({
        label: c.FunctionArn,
        data: c.FunctionUrl,
    }))
    return createQuickPick(items, { title: 'Select function to copy url from.' })
}
