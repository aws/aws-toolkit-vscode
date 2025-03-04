/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { IAM, StepFunctions } from 'aws-sdk'
import { DefaultIamClient } from '../../shared/clients/iamClient'
import { DefaultStepFunctionsClient } from '../../shared/clients/stepFunctionsClient'
import { ApiAction, ApiCallRequestMessage, Command, MessageType, WebviewContext } from './types'
import { telemetry } from '../../shared/telemetry/telemetry'

export class WorkflowStudioApiHandler {
    public constructor(
        region: string,
        private readonly context: WebviewContext,
        private readonly clients = {
            sfn: new DefaultStepFunctionsClient(region),
            iam: new DefaultIamClient(region),
        }
    ) {}

    /**
     * Performs the API call on behalf of the webview, and sends the sucesss or error response to the webview.
     */
    public async performApiCall({ apiName, params, requestId }: ApiCallRequestMessage): Promise<void> {
        try {
            let response
            switch (apiName) {
                case ApiAction.IAMListRoles:
                    response = await this.listRoles(params)
                    break
                case ApiAction.SFNTestState:
                    response = await this.testState(params)
                    break
                default:
                    throw new Error(`Unknown API: ${apiName}`)
            }

            await this.context.panel.webview.postMessage({
                messageType: MessageType.RESPONSE,
                command: Command.API_CALL,
                apiName,
                response,
                requestId,
                isSuccess: true,
            })
        } catch (err) {
            await this.context.panel.webview.postMessage({
                messageType: MessageType.RESPONSE,
                command: Command.API_CALL,
                apiName,
                error:
                    err instanceof Error
                        ? {
                              message: err.message,
                              name: err.name,
                              stack: err.stack,
                          }
                        : {
                              message: String(err),
                          },
                requestId,
                isSuccess: false,
            })
        }
    }

    public async testState(params: StepFunctions.TestStateInput): Promise<StepFunctions.TestStateOutput> {
        telemetry.ui_click.emit({
            elementId: 'stepfunctions_testState',
        })
        return this.clients.sfn.testState(params)
    }

    public async listRoles(params: IAM.ListRolesRequest): Promise<IAM.Role[]> {
        return this.clients.iam.listRoles(params)
    }
}
