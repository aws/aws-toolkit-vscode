/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    CreateStateMachineCommand,
    CreateStateMachineCommandInput,
    CreateStateMachineCommandOutput,
    DescribeExecutionCommand,
    DescribeExecutionCommandInput,
    DescribeExecutionCommandOutput,
    DescribeMapRunCommand,
    DescribeMapRunCommandInput,
    DescribeMapRunCommandOutput,
    DescribeStateMachineCommand,
    DescribeStateMachineCommandInput,
    DescribeStateMachineCommandOutput,
    DescribeStateMachineForExecutionCommand,
    DescribeStateMachineForExecutionCommandInput,
    DescribeStateMachineForExecutionCommandOutput,
    GetExecutionHistoryCommand,
    GetExecutionHistoryCommandInput,
    GetExecutionHistoryCommandOutput,
    ListStateMachinesCommand,
    ListStateMachinesCommandInput,
    ListStateMachinesCommandOutput,
    RedriveExecutionCommand,
    RedriveExecutionCommandInput,
    RedriveExecutionCommandOutput,
    SFNClient,
    StartExecutionCommand,
    StartExecutionCommandInput,
    StartExecutionCommandOutput,
    StateMachineListItem,
    StopExecutionCommand,
    StopExecutionCommandInput,
    TestStateCommand,
    TestStateCommandInput,
    TestStateCommandOutput,
    UpdateStateMachineCommand,
    UpdateStateMachineCommandInput,
    UpdateStateMachineCommandOutput,
} from '@aws-sdk/client-sfn'
import { ClientWrapper } from './clientWrapper'
import { StopAccessLoggingOutput } from 'aws-sdk/clients/mediastore'
// import { StopExecutionInput } from 'aws-sdk/clients/stepfunctions'

export class StepFunctionsClient extends ClientWrapper<SFNClient> {
    public constructor(regionCode: string) {
        super(regionCode, SFNClient)
    }

    public async *listStateMachines(
        request: ListStateMachinesCommandInput = {}
    ): AsyncIterableIterator<StateMachineListItem> {
        do {
            const response: ListStateMachinesCommandOutput = await this.makeRequest(ListStateMachinesCommand, request)
            if (response.stateMachines) {
                yield* response.stateMachines
            }
            request.nextToken = response.nextToken
        } while (request.nextToken)
    }

    public async getStateMachineDetails(
        request: DescribeStateMachineCommandInput
    ): Promise<DescribeStateMachineCommandOutput> {
        return this.makeRequest(DescribeStateMachineCommand, request)
    }

    public async getStateMachineDetailsForExecution(
        request: DescribeStateMachineForExecutionCommandInput
    ): Promise<DescribeStateMachineForExecutionCommandOutput> {
        return this.makeRequest(DescribeStateMachineForExecutionCommand, request)
    }

    public async getExecutionDetails(request: DescribeExecutionCommandInput): Promise<DescribeExecutionCommandOutput> {
        return this.makeRequest(DescribeExecutionCommand, request)
    }

    public async getMapRunDetails(request: DescribeMapRunCommandInput): Promise<DescribeMapRunCommandOutput> {
        return this.makeRequest(DescribeMapRunCommand, request)
    }

    public async getExecutionHistory(
        request: GetExecutionHistoryCommandInput
    ): Promise<GetExecutionHistoryCommandOutput> {
        return this.makeRequest(GetExecutionHistoryCommand, request)
    }

    public async reDriveExecution(request: RedriveExecutionCommandInput): Promise<RedriveExecutionCommandOutput> {
        return this.makeRequest(RedriveExecutionCommand, request)
    }

    public async executeStateMachine(request: StartExecutionCommandInput): Promise<StartExecutionCommandOutput> {
        return this.makeRequest(StartExecutionCommand, request)
    }

    public async stopExecution(request: StopExecutionCommandInput): Promise<StopAccessLoggingOutput> {
        return this.makeRequest(StopExecutionCommand, request)
    }

    public async createStateMachine(request: CreateStateMachineCommandInput): Promise<CreateStateMachineCommandOutput> {
        return this.makeRequest(CreateStateMachineCommand, request)
    }

    public async updateStateMachine(request: UpdateStateMachineCommandInput): Promise<UpdateStateMachineCommandOutput> {
        return this.makeRequest(UpdateStateMachineCommand, request)
    }

    public async testState(request: TestStateCommandInput): Promise<TestStateCommandOutput> {
        return this.makeRequest(TestStateCommand, request)
    }
}
