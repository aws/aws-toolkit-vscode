/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import _ = require('lodash')
import * as vscode from 'vscode'
import { FunctionNode } from '../../explorer/nodes/functionNode'
import { AwsContext } from '../../shared/awsContext'
import { BaseTemplates } from '../../shared/templates/baseTemplates'
import { LambdaTemplates } from '../templates/lambdaTemplates'
import { getSelectedLambdaNode } from '../utils'

export async function getLambdaConfig(awsContext: AwsContext, element?: FunctionNode) {
    try {
        const fn: FunctionNode = await getSelectedLambdaNode(awsContext, element)

        const view = vscode.window.createWebviewPanel(
            'html',
            `Getting config for ${fn.functionConfiguration.FunctionName}`,
            -1
        )

        const baseTemplateFn = _.template(BaseTemplates.SIMPLE_HTML)
        view.webview.html = baseTemplateFn({ content: '<h1>Loading...</h1>' })
        const funcResponse = await fn.lambda.getFunctionConfiguration({
            FunctionName: fn.functionConfiguration.FunctionName!
        }).promise()

        const getConfigTemplateFn = _.template(LambdaTemplates.GET_CONFIG_TEMPLATE)
        view.webview.html = baseTemplateFn({
            content: getConfigTemplateFn(funcResponse)
        })
    } catch (err) {
        const error = err as Error
        console.log(error.message)
    }
}
