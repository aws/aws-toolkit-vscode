/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as StepFunctions from '@aws-sdk/client-sfn'
import { IamClient, IamRole } from '../../shared/clients/iam'
import { StepFunctionsClient } from '../../shared/clients/stepFunctions'
import { CloudWatchLogsClient } from '../../shared/clients/cloudWatchLogs'
import { DefaultLambdaClient } from '../../shared/clients/lambdaClient'
import { ApiAction, ApiCallRequestMessage, Command, MessageType, BaseContext } from './types'
import { telemetry } from '../../shared/telemetry/telemetry'
import { ListRolesRequest } from '@aws-sdk/client-iam'

export class StepFunctionApiHandler {
    public constructor(
        region: string,
        private readonly context: BaseContext,
        private readonly clients = {
            sfn: new StepFunctionsClient(region),
            iam: new IamClient(region),
            cwl: new CloudWatchLogsClient(region),
            lambda: new DefaultLambdaClient(region),
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
                    response = await this.clients.sfn.getStateMachineDetails(params)
                    break
                case ApiAction.SFNDescribeStateMachineForExecution:
                    response = await this.clients.sfn.describeStateMachineForExecution(params)
                    break
                case ApiAction.SFNDescribeExecution:
                    response = await this.clients.sfn.describeExecution(params)
                    break
                case ApiAction.SFNDescribeMapRun:
                    response = await this.clients.sfn.describeMapRun(params)
                    break
                case ApiAction.SFNGetExecutionHistory:
                    response = await this.clients.sfn.getExecutionHistory(params)
                    break
                case ApiAction.SFNRedriveExecution:
                    response = await this.clients.sfn.reDriveExecution(params)
                    break
                case ApiAction.SFNStartExecution:
                    response = await this.clients.sfn.executeStateMachine(params)
                    break
                case ApiAction.SFNStopExecution:
                    response = await this.clients.sfn.stopExecution(params)
                    break
                case ApiAction.CWlFilterLogEvents:
                    response = await this.clients.cwl.filterLogEvents(params)
                    break
                case ApiAction.LambdaGetFunctionConfiguration:
                    response = await this.clients.lambda.getFunctionConfiguration(params.FunctionName!)
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
