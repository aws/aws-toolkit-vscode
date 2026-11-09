/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    CreateStateMachineCommand,
    CreateStateMachineCommandInput,
    CreateStateMachineCommandOutput,
    DescribeStateMachineCommand,
    DescribeStateMachineCommandInput,
    DescribeStateMachineCommandOutput,
    ListStateMachinesCommand,
    ListStateMachinesCommandInput,
    ListStateMachinesCommandOutput,
    SFNClient,
    StartExecutionCommand,
    StartExecutionCommandInput,
    StartExecutionCommandOutput,
    StateMachineListItem,
    TestStateCommand,
    TestStateCommandInput,
    TestStateCommandOutput,
    UpdateStateMachineCommand,
    UpdateStateMachineCommandInput,
    UpdateStateMachineCommandOutput,
} from '@aws-sdk/client-sfn'
import { ClientWrapper } from './clientWrapper'

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

    public async executeStateMachine(request: StartExecutionCommandInput): Promise<StartExecutionCommandOutput> {
        return this.makeRequest(StartExecutionCommand, request)
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
