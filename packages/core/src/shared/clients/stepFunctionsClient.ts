/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { StepFunctions } from 'aws-sdk'
import globals from '../extensionGlobals'
import { ClassToInterfaceType } from '../utilities/tsUtils'

export type StepFunctionsClient = ClassToInterfaceType<DefaultStepFunctionsClient>
export class DefaultStepFunctionsClient {
    public constructor(public readonly regionCode: string) {}

    public async *listStateMachines(): AsyncIterableIterator<StepFunctions.StateMachineListItem> {
        const client = await this.createSdkClient()

        const request: StepFunctions.ListStateMachinesInput = {}
        do {
            const response: StepFunctions.ListStateMachinesOutput = await client.listStateMachines(request).promise()

            if (response.stateMachines) {
                yield* response.stateMachines
            }
            request.nextToken = response.nextToken
        } while (request.nextToken)
    }

    public async getStateMachineDetails(arn: string): Promise<StepFunctions.DescribeStateMachineOutput> {
        const client = await this.createSdkClient()

        const request: StepFunctions.DescribeStateMachineInput = {
            stateMachineArn: arn,
        }
        const response: StepFunctions.DescribeStateMachineOutput = await client.describeStateMachine(request).promise()

        return response
    }

    public async getStateMachineDetailsForExecution(
        arn: string
    ): Promise<StepFunctions.DescribeStateMachineForExecutionOutput> {
        const client = await this.createSdkClient()

        const request: StepFunctions.DescribeStateMachineForExecutionInput = {
            executionArn: arn,
        }
        const response: StepFunctions.DescribeStateMachineForExecutionOutput = await client
            .describeStateMachineForExecution(request)
            .promise()

        return response
    }

    public async getExecutionDetails(arn: string): Promise<StepFunctions.DescribeExecutionOutput> {
        const client = await this.createSdkClient()

        const request: StepFunctions.DescribeExecutionInput = {
            executionArn: arn,
        }
        const response: StepFunctions.DescribeExecutionOutput = await client.describeExecution(request).promise()

        return response
    }

    public async getMapRunDetails(arn: string): Promise<StepFunctions.DescribeMapRunOutput> {
        const client = await this.createSdkClient()

        const request: StepFunctions.DescribeMapRunInput = {
            mapRunArn: arn,
        }
        const response: StepFunctions.DescribeMapRunOutput = await client.describeMapRun(request).promise()

        return response
    }

    public async getExecutionHistory(arn: string): Promise<StepFunctions.GetExecutionHistoryOutput> {
        const client = await this.createSdkClient()

        const request: StepFunctions.GetExecutionHistoryInput = {
            executionArn: arn,
        }
        const response: StepFunctions.GetExecutionHistoryOutput = await client.getExecutionHistory(request).promise()

        return response
    }

    public async reDriveExecution(arn: string): Promise<StepFunctions.RedriveExecutionOutput> {
        const client = await this.createSdkClient()

        const request: StepFunctions.RedriveExecutionInput = {
            executionArn: arn,
        }
        const response: StepFunctions.RedriveExecutionOutput = await client.redriveExecution(request).promise()

        return response
    }

    public async stopExecution(arn: string): Promise<StepFunctions.StopExecutionOutput> {
        const client = await this.createSdkClient()

        const request: StepFunctions.StopExecutionInput = {
            executionArn: arn,
        }
        const response: StepFunctions.StopExecutionOutput = await client.stopExecution(request).promise()

        return response
    }

    public async executeStateMachine(arn: string, input?: string): Promise<StepFunctions.StartExecutionOutput> {
        const client = await this.createSdkClient()

        const request: StepFunctions.StartExecutionInput = {
            stateMachineArn: arn,
            input: input,
        }
        const response: StepFunctions.StartExecutionOutput = await client.startExecution(request).promise()

        return response
    }

    public async createStateMachine(
        params: StepFunctions.CreateStateMachineInput
    ): Promise<StepFunctions.CreateStateMachineOutput> {
        const client = await this.createSdkClient()

        return client.createStateMachine(params).promise()
    }

    public async updateStateMachine(
        params: StepFunctions.UpdateStateMachineInput
    ): Promise<StepFunctions.UpdateStateMachineOutput> {
        const client = await this.createSdkClient()

        return client.updateStateMachine(params).promise()
    }

    public async testState(params: StepFunctions.TestStateInput): Promise<StepFunctions.TestStateOutput> {
        const client = await this.createSdkClient()

        return await client.testState(params).promise()
    }

    private async createSdkClient(): Promise<StepFunctions> {
        return await globals.sdkClientBuilder.createAwsService(StepFunctions, undefined, this.regionCode)
    }
}
