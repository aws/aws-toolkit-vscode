/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import _ = require('lodash')
import * as vscode from 'vscode'
import { AwsContext } from '../../shared/awsContext'
import { BaseTemplates } from '../../shared/templates/baseTemplates'
import { FunctionNodeBase } from '../explorer/functionNode'
import { LambdaTemplates } from '../templates/lambdaTemplates'
import { selectLambdaNode } from '../utils'

export async function getLambdaConfig(awsContext: AwsContext, element?: FunctionNodeBase) {
    try {
        const fn: FunctionNodeBase = await selectLambdaNode(awsContext, element)

        const view = vscode.window.createWebviewPanel(
            'html',
            `Getting config for ${fn.info.configuration.FunctionName}`,
            -1
        )

        const baseTemplateFn = _.template(BaseTemplates.SIMPLE_HTML)
        view.webview.html = baseTemplateFn({ content: '<h1>Loading...</h1>' })
        const funcResponse = await fn.info.client.getFunctionConfiguration({
            FunctionName: fn.info.configuration.FunctionName!
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
