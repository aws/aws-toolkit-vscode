/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ServiceConfigurationOptions } from 'aws-sdk/lib/service'
import { CloudFormationClient } from './cloudFormationClient'
import { CloudWatchLogsClient } from './cloudWatchLogsClient'
import { EcsClient } from './ecsClient'
import { IamClient } from './iamClient'
import { LambdaClient } from './lambdaClient'
import { SchemaClient } from './schemaClient'
import { StepFunctionsClient } from './stepFunctionsClient'
import { StsClient } from './stsClient'

export interface ToolkitClientBuilder {
    createCloudFormationClient(regionCode: string): CloudFormationClient

    createCloudWatchLogsClient(regionCode: string): CloudWatchLogsClient

    createEcsClient(regionCode: string): EcsClient

    createLambdaClient(regionCode: string): LambdaClient

    createSchemaClient(regionCode: string): SchemaClient

    createStepFunctionsClient(regionCode: string): StepFunctionsClient

    createStsClient(regionCode: string, credentials?: ServiceConfigurationOptions): StsClient

    createIamClient(regionCode: string): IamClient
}
