/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { StepFunctions } from 'aws-sdk'
import { ext } from '../extensionGlobals'
import '../utilities/asyncIteratorShim'
import { StepFunctionsClient } from './stepFunctionsClient'

export class DefaultStepFunctionsClient implements StepFunctionsClient {
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

    private async createSdkClient(): Promise<StepFunctions> {
        return await ext.sdkClientBuilder.createAndConfigureServiceClient(
            options => new StepFunctions(options),
            undefined,
            this.regionCode
        )
    }
}
