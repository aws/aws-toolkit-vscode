/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ServiceConfigurationOptions } from 'aws-sdk/lib/service'
import { ApiGatewayClient } from './apiGatewayClient'
import { CloudFormationClient } from './cloudFormationClient'
import { CloudWatchLogsClient } from './cloudWatchLogsClient'
import { DefaultApiGatewayClient } from './defaultApiGatewayClient'
import { DefaultCloudFormationClient } from './defaultCloudFormationClient'
import { DefaultCloudWatchLogsClient } from './defaultCloudWatchLogsClient'
import { DefaultEcrClient } from './defaultEcrClient'
import { DefaultEcsClient } from './defaultEcsClient'
import { DefaultIamClient } from './defaultIamClient'
import { DefaultLambdaClient } from './defaultLambdaClient'
import { DefaultSchemaClient } from './defaultSchemaClient'
import { DefaultStepFunctionsClient } from './defaultStepFunctionsClient'
import { DefaultStsClient } from './defaultStsClient'
import { DefaultSsmDocumentClient } from './defaultSsmDocumentClient'
import { EcrClient } from './ecrClient'
import { EcsClient } from './ecsClient'
import { IamClient } from './iamClient'
import { LambdaClient } from './lambdaClient'
import { SchemaClient } from './schemaClient'
import { StepFunctionsClient } from './stepFunctionsClient'
import { StsClient } from './stsClient'
import { SsmDocumentClient } from './ssmDocumentClient'
import { ToolkitClientBuilder } from './toolkitClientBuilder'
import { DefaultS3Client } from './defaultS3Client'
import { S3Client } from './s3Client'
import { RegionProvider } from '../regions/regionProvider'
import { DEFAULT_PARTITION } from '../regions/regionUtilities'

export class DefaultToolkitClientBuilder implements ToolkitClientBuilder {
    public constructor(private readonly regionProvider: RegionProvider) {}

    public createApiGatewayClient(regionCode: string): ApiGatewayClient {
        return new DefaultApiGatewayClient(regionCode)
    }

    public createCloudFormationClient(regionCode: string): CloudFormationClient {
        return new DefaultCloudFormationClient(regionCode)
    }

    public createCloudWatchLogsClient(regionCode: string): CloudWatchLogsClient {
        return new DefaultCloudWatchLogsClient(regionCode)
    }

    public createEcrClient(regionCode: string): EcrClient {
        return new DefaultEcrClient(regionCode)
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

    public createSchemaClient(regionCode: string): SchemaClient {
        return new DefaultSchemaClient(regionCode)
    }

    public createStepFunctionsClient(regionCode: string): StepFunctionsClient {
        return new DefaultStepFunctionsClient(regionCode)
    }

    public createStsClient(regionCode: string, credentials?: ServiceConfigurationOptions): StsClient {
        return new DefaultStsClient(regionCode, credentials)
    }

    public createS3Client(regionCode: string): S3Client {
        return new DefaultS3Client(this.regionProvider.getPartitionId(regionCode) ?? DEFAULT_PARTITION, regionCode)
    }

    public createSsmClient(regionCode: string): SsmDocumentClient {
        return new DefaultSsmDocumentClient(regionCode)
    }
}
