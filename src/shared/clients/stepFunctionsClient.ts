/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { StepFunctions } from 'aws-sdk'

export interface StepFunctionsClient {
    readonly regionCode: string

    listStateMachines(): AsyncIterableIterator<StepFunctions.StateMachineListItem>

    getStateMachineDetails(arn: string): Promise<StepFunctions.DescribeStateMachineOutput>

    executeStateMachine(arn: string, input?: string): Promise<StepFunctions.StartExecutionOutput>

    createStateMachine(params: StepFunctions.CreateStateMachineInput): Promise<StepFunctions.CreateStateMachineOutput>

    updateStateMachine(params: StepFunctions.UpdateStateMachineInput): Promise<StepFunctions.UpdateStateMachineOutput>
}
