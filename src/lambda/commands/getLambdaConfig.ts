/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import _ = require('lodash')
import * as vscode from 'vscode'
import { AwsContext } from '../../shared/awsContext'
import { LambdaClient } from '../../shared/clients/lambdaClient'
import { ext } from '../../shared/extensionGlobals'
import { getLogger, Logger } from '../../shared/logger'
import { BaseTemplates } from '../../shared/templates/baseTemplates'
import { FunctionNodeBase } from '../explorer/functionNode'
import { LambdaTemplates } from '../templates/lambdaTemplates'
import { selectLambdaNode } from '../utils'

export async function getLambdaConfig(
    awsContext: AwsContext,
    element?: FunctionNodeBase
) {
    const logger: Logger = getLogger()
    try {
        const fn: FunctionNodeBase = await selectLambdaNode(awsContext, element)

        const view = vscode.window.createWebviewPanel(
            'html',
            `Getting config for ${fn.configuration.FunctionName}`,
            -1
        )

        const baseTemplateFn = _.template(BaseTemplates.SIMPLE_HTML)
        view.webview.html = baseTemplateFn({ content: '<h1>Loading...</h1>' })

        const client: LambdaClient = ext.toolkitClientBuilder.createLambdaClient(fn.regionCode)
        const funcResponse = await client.getFunctionConfiguration(fn.configuration.FunctionName!)

        const getConfigTemplateFn = _.template(LambdaTemplates.GET_CONFIG_TEMPLATE)
        view.webview.html = baseTemplateFn({
            content: getConfigTemplateFn(funcResponse)
        })
    } catch (err) {
        const error = err as Error
        logger.error(error)
    }
}
