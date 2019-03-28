/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { AWSError, Lambda } from 'aws-sdk'
import _ = require('lodash')
import * as vscode from 'vscode'
import { LambdaClient } from '../shared/clients/lambdaClient'
import { ext } from '../shared/extensionGlobals'
import { getLogger, Logger } from '../shared/logger'
import { BaseTemplates } from '../shared/templates/baseTemplates'
import { LambdaPolicyTemplates } from './templates/lambdaTemplates'

export interface LambdaPolicyProvider {
    functionName: string
    getLambdaPolicy(): Thenable<Lambda.GetPolicyResponse>
}

export class DefaultLambdaPolicyProvider implements LambdaPolicyProvider {
    public functionName: string

    public constructor(
        functionName: string,
        private readonly regionCode: string
    ) {
        if (!functionName) {
            throw new Error('Lambda function name is missing')
        }

        this.functionName = functionName
    }

    public async getLambdaPolicy(): Promise<Lambda.GetPolicyResponse> {
        const client: LambdaClient = ext.toolkitClientBuilder.createLambdaClient(this.regionCode)

        return await client.getPolicy(this.functionName)
    }
}

export enum LambdaPolicyViewStatus {
    Initialized,
    Loading,
    Loaded,
    Error,
    Disposed
}

export class LambdaPolicyView implements vscode.Disposable {

    private static readonly VIEW_TEMPLATE: _.TemplateExecutor = _.template(BaseTemplates.SIMPLE_HTML)
    private static readonly VIEW_CONTENT_OUTER_CONTENT: _.TemplateExecutor =
        _.template(LambdaPolicyTemplates.OUTER_TEMPLATE)
    private static readonly VIEW_CONTENT_TEMPLATE_LOADING: _.TemplateExecutor =
        _.template(LambdaPolicyTemplates.INNER_TEMPLATE_LOADING)
    private static readonly VIEW_CONTENT_TEMPLATE_POLICY: _.TemplateExecutor =
        _.template(LambdaPolicyTemplates.INNER_TEMPLATE_POLICY)
    private static readonly VIEW_CONTENT_TEMPLATE_ERROR: _.TemplateExecutor =
        _.template(LambdaPolicyTemplates.INNER_TEMPLATE_ERROR)

    protected _view: vscode.WebviewPanel | undefined

    private readonly _lambdaPolicyProvider: LambdaPolicyProvider
    private _status: LambdaPolicyViewStatus

    public constructor(
        lambdaPolicyProvider: LambdaPolicyProvider
    ) {
        this._lambdaPolicyProvider = lambdaPolicyProvider

        this._view = this.createView()
        this._status = LambdaPolicyViewStatus.Initialized
    }

    public async load(): Promise<void> {

        const logger: Logger = getLogger()

        this.showLoadingContent()

        try {
            const policyResponse: Lambda.GetPolicyResponse = await this._lambdaPolicyProvider.getLambdaPolicy()

            this.showPolicyContent(policyResponse)
        } catch (err) {
            const error = err as Error
            logger.error('Error loading and showing Lambda Policy', error)
            this.showError(error)
        }
    }

    public get status(): LambdaPolicyViewStatus {
        return this._status
    }

    public dispose() {
        if (!!this._view) {
            this._view.dispose()
        }
    }

    private createView(): vscode.WebviewPanel {

        const view: vscode.WebviewPanel = vscode.window.createWebviewPanel(
            'html',
            localize(
                'AWS.lambda.policy.title',
                'Lambda Policy: {0}',
                this._lambdaPolicyProvider.functionName
            ),
            -1
        )

        const disposeListener = view.onDidDispose(() => {
            this._view = undefined
            disposeListener.dispose()
            this._status = LambdaPolicyViewStatus.Disposed
        })

        return view
    }

    private showContent(innerContent: string): void {
        if (this._view === undefined) {
            throw new Error('View was disposed')
        }

        this._view.webview.html = LambdaPolicyView.VIEW_TEMPLATE({
            content: LambdaPolicyView.VIEW_CONTENT_OUTER_CONTENT({
                FunctionName: _.escape(this._lambdaPolicyProvider.functionName),
                innerContent: innerContent
            })
        })
    }

    private showLoadingContent() {
        this.showContent(LambdaPolicyView.VIEW_CONTENT_TEMPLATE_LOADING())
        this._status = LambdaPolicyViewStatus.Loading
    }

    private showPolicyContent(policyResponse: Lambda.GetPolicyResponse) {
        const policy: string = policyResponse.Policy || '{}'
        const policyFormatted: string = JSON.stringify(JSON.parse(policy), undefined, 4)
        this.showContent(
            LambdaPolicyView.VIEW_CONTENT_TEMPLATE_POLICY(
                {
                    Policy: policyFormatted
                }
            )
        )
        this._status = LambdaPolicyViewStatus.Loaded
    }

    private showError(error: Error) {
        const awsError = error as AWSError

        const errorMessage = awsError.message
        const errorCode = awsError.code || localize('AWS.error.no.error.code', 'No error code')

        this.showErrorContent(errorCode, errorMessage)
    }

    private showErrorContent(errorCode: string, errorMessage: string) {
        this.showContent(
            LambdaPolicyView.VIEW_CONTENT_TEMPLATE_ERROR(
                {
                    ErrorCode: _.escape(errorCode),
                    ErrorMessage: _.escape(errorMessage)
                }
            )
        )
        this._status = LambdaPolicyViewStatus.Error
    }
}
