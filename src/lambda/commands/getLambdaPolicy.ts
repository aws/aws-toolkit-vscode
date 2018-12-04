/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { AWSError } from 'aws-sdk'
import _ = require('lodash')
import * as vscode from 'vscode'
import { AwsContext } from '../../shared/awsContext'
import { BaseTemplates } from '../../shared/templates/baseTemplates'
import { FunctionNode } from '../explorer/functionNode'
import { LambdaTemplates } from '../templates/lambdaTemplates'
import { getSelectedLambdaNode } from '../utils'

export async function getLambdaPolicy(awsContext: AwsContext, element?: FunctionNode) {
    let functionName: string = localize('AWS.lambda.policy.unknown.function', 'Unknown')
    let view: vscode.WebviewPanel | undefined
    const baseTemplateFn = _.template(BaseTemplates.SIMPLE_HTML)

    try {
        const fn: FunctionNode = await getSelectedLambdaNode(awsContext, element)
        if (!!fn.functionConfiguration.FunctionName) {
            functionName = fn.functionConfiguration.FunctionName
        }

        view = vscode.window.createWebviewPanel(
            'html',
            localize(
                'AWS.lambda.policy.title',
                'Lambda Policy: {0}',
                functionName
            ),
            -1
        )
        view.webview.html = baseTemplateFn({
            content: `<h1>${localize('AWS.lambda.policy.loading', 'Loading...')}</h1>`
        })

        const funcResponse = await fn.lambda.getPolicy({
            FunctionName: fn.functionConfiguration.FunctionName!
        }).promise()
        const getPolicyTemplateFn = _.template(LambdaTemplates.GET_POLICY_TEMPLATE)
        view.webview.html = baseTemplateFn({
            content: getPolicyTemplateFn({
                FunctionName: functionName,
                Policy: funcResponse.Policy!
            })
        })
    } catch (err) {
        const error = err as AWSError

        const errorMessage = error.message
        const errorCode = error.code || localize('AWS.error.no.error.code', 'No error code')

        console.log(errorMessage)

        const getPolicyTemplateFn = _.template(LambdaTemplates.GET_POLICY_TEMPLATE_ERROR)
        if (!!view) {
            view.webview.html = baseTemplateFn({
                content: getPolicyTemplateFn({
                    FunctionName: functionName,
                    ErrorCode: errorCode,
                    ErrorMessage: errorMessage
                })
            })
        }
    }
}
