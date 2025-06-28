/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { StepFunctions } from 'aws-sdk'
import { IamClient, IamRole } from '../../shared/clients/iam'
import { DefaultStepFunctionsClient } from '../../shared/clients/stepFunctionsClient'
import { ApiAction, ApiCallRequestMessage, Command, MessageType, WebviewContext } from './types'
import { telemetry } from '../../shared/telemetry/telemetry'
import { ListRolesRequest } from '@aws-sdk/client-iam'

export class WorkflowStudioApiHandler {
    public constructor(
        region: string,
        private readonly context: WebviewContext,
        private readonly clients = {
            sfn: new DefaultStepFunctionsClient(region),
            iam: new IamClient(region),
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
                case ApiAction.SFNDescribeStateMachine:
                    response = await this.clients.sfn.getStateMachineDetails(params.stateMachineArn)
                    break
                case ApiAction.SFNDescribeStateMachineForExecution:
                    response = await this.clients.sfn.getStateMachineDetailsForExecution(params.executionArn)
                    break
                case ApiAction.SFNDescribeExecution:
                    response = await this.clients.sfn.getExecutionDetails(params.executionArn)
                    break
                case ApiAction.SFNDescribeMapRun:
                    response = await this.clients.sfn.getMapRunDetails(params.mapRunArn)
                    break
                case ApiAction.SFNGetExecutionHistory:
                    response = await this.clients.sfn.getExecutionHistory(params.executionArn)
                    break
                case ApiAction.SFNRedriveExecution:
                    response = await this.clients.sfn.reDriveExecution(params.executionArn)
                    break
                case ApiAction.SFNStartExecution:
                    response = await this.clients.sfn.executeStateMachine(params.stateMachineArn, params.input)
                    break
                case ApiAction.SFNStopExecution:
                    response = await this.clients.sfn.stopExecution(params.executionArn)
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

    public async listRoles(params: ListRolesRequest): Promise<IamRole[]> {
        return this.clients.iam.resolveRoles(params)
    }
}
