/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */



import {
    CreateStateMachineCommandInput,
    CreateStateMachineCommandOutput,
    DescribeStateMachineCommandInput,
    DescribeStateMachineCommandOutput,
    ListStateMachinesCommandInput,
    ListStateMachinesCommandOutput,
    SFN,
    StartExecutionCommandInput,
    StartExecutionCommandOutput,
    StateMachineListItem,
    UpdateStateMachineCommandInput,
    UpdateStateMachineCommandOutput,
} from "@aws-sdk/client-sfn";

import globals from '../extensionGlobals'
import { ClassToInterfaceType } from '../utilities/tsUtils'

export type StepFunctionsClient = ClassToInterfaceType<DefaultStepFunctionsClient>
export class DefaultStepFunctionsClient {
    public constructor(public readonly regionCode: string) {}

    public async *listStateMachines(): AsyncIterableIterator<StateMachineListItem> {
        const client = await this.createSdkClient()

        const request: ListStateMachinesCommandInput = {}
        do {
            const response: ListStateMachinesCommandOutput = await client.listStateMachines(request).promise()

            if (response.stateMachines) {
                yield* response.stateMachines
            }

            request.nextToken = response.nextToken
        } while (request.nextToken)
    }

    public async getStateMachineDetails(arn: string): Promise<DescribeStateMachineCommandOutput> {
        const client = await this.createSdkClient()

        const request: DescribeStateMachineCommandInput = {
            stateMachineArn: arn,
        }

        const response: DescribeStateMachineCommandOutput = await client.describeStateMachine(request).promise()

        return response
    }

    public async executeStateMachine(arn: string, input?: string): Promise<StartExecutionCommandOutput> {
        const client = await this.createSdkClient()

        const request: StartExecutionCommandInput = {
            stateMachineArn: arn,
            input: input,
        }

        const response: StartExecutionCommandOutput = await client.startExecution(request).promise()

        return response
    }

    public async createStateMachine(
        params: CreateStateMachineCommandInput
    ): Promise<CreateStateMachineCommandOutput> {
        const client = await this.createSdkClient()

        return client.createStateMachine(params).promise()
    }

    public async updateStateMachine(
        params: UpdateStateMachineCommandInput
    ): Promise<UpdateStateMachineCommandOutput> {
        const client = await this.createSdkClient()

        return client.updateStateMachine(params).promise()
    }

    private async createSdkClient(): Promise<StepFunctions> {
        return await globals.sdkClientBuilder.createAwsService(StepFunctions, undefined, this.regionCode)
    }
}
