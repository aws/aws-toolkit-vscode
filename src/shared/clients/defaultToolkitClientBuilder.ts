/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ServiceConfigurationOptions } from 'aws-sdk/lib/service'
import { CloudFormationClient } from './cloudFormationClient'
import { DefaultCloudFormationClient } from './defaultCloudFormationClient'
import { DefaultEcsClient } from './defaultEcsClient'
import { DefaultLambdaClient } from './defaultLambdaClient'
import { DefaultStsClient } from './defaultStsClient'
import { EcsClient } from './ecsClient'
import { LambdaClient } from './lambdaClient'
import { StsClient } from './stsClient'
import { ToolkitClientBuilder } from './toolkitClientBuilder'

export class DefaultToolkitClientBuilder implements ToolkitClientBuilder {
    public createCloudFormationClient(regionCode: string): CloudFormationClient {
        return new DefaultCloudFormationClient(regionCode)
    }

    public createEcsClient(regionCode: string): EcsClient {
        return new DefaultEcsClient(regionCode)
    }

    public createLambdaClient(regionCode: string): LambdaClient {
        return new DefaultLambdaClient(regionCode)
    }

    public createStsClient(regionCode: string, credentials?: ServiceConfigurationOptions): StsClient {
        return new DefaultStsClient(regionCode, credentials)
    }
}
