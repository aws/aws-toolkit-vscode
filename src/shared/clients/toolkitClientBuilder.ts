/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ServiceConfigurationOptions } from 'aws-sdk/lib/service'
import { CloudFormationClient } from './cloudFormationClient'
import { EcsClient } from './ecsClient'
import { LambdaClient } from './lambdaClient'
import { StsClient } from './stsClient'

export interface ToolkitClientBuilder {
    createCloudFormationClient(regionCode: string): CloudFormationClient

    createEcsClient(regionCode: string): EcsClient

    createLambdaClient(regionCode: string): LambdaClient

    createStsClient(regionCode: string, credentials?: ServiceConfigurationOptions): StsClient
}
