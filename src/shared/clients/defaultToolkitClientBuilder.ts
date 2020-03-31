/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ServiceConfigurationOptions } from 'aws-sdk/lib/service'
import { CloudFormationClient } from './cloudFormationClient'
import { DefaultCloudFormationClient } from './defaultCloudFormationClient'
import { DefaultEcsClient } from './defaultEcsClient'
import { DefaultIamClient } from './defaultIamClient'
import { DefaultLambdaClient } from './defaultLambdaClient'
import { DefaultSchemaClient } from './defaultSchemaClient'
import { DefaultStepFunctionsClient } from './defaultStepFunctionsClient'
import { DefaultStsClient } from './defaultStsClient'
import { EcsClient } from './ecsClient'
import { IamClient } from './iamClient'
import { LambdaClient } from './lambdaClient'
import { SchemaClient } from './schemaClient'
import { StepFunctionsClient } from './stepFunctionsClient'
import { StsClient } from './stsClient'
import { ToolkitClientBuilder } from './toolkitClientBuilder'

export class DefaultToolkitClientBuilder implements ToolkitClientBuilder {
    public createCloudFormationClient(regionCode: string): CloudFormationClient {
        return new DefaultCloudFormationClient(regionCode)
    }

    public createSchemaClient(regionCode: string): SchemaClient {
        return new DefaultSchemaClient(regionCode)
    }

    public createEcsClient(regionCode: string): EcsClient {
        return new DefaultEcsClient(regionCode)
    }

    public createIamClient(regionCode: string): IamClient {
        return new DefaultIamClient(regionCode)
    }

    public createLambdaClient(regionCode: string): LambdaClient {
        return new DefaultLambdaClient(regionCode)
    }

    public createStepFunctionsClient(regionCode: string): StepFunctionsClient {
        return new DefaultStepFunctionsClient(regionCode)
    }

    public createStsClient(regionCode: string, credentials?: ServiceConfigurationOptions): StsClient {
        return new DefaultStsClient(regionCode, credentials)
    }
}
