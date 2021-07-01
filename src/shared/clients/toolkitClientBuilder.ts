/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ServiceConfigurationOptions } from 'aws-sdk/lib/service'
import { ApiGatewayClient, DefaultApiGatewayClient } from './apiGatewayClient'
import { CloudFormationClient, DefaultCloudFormationClient } from './cloudFormationClient'
import { CloudWatchLogsClient, DefaultCloudWatchLogsClient } from './cloudWatchLogsClient'
import { DefaultEcrClient, EcrClient } from './ecrClient'
import { DefaultEcsClient, EcsClient } from './ecsClient'
import { DefaultIamClient, IamClient } from './iamClient'
import { DefaultLambdaClient, LambdaClient } from './lambdaClient'
import { DefaultSchemaClient, SchemaClient } from './schemaClient'
import { DefaultStepFunctionsClient, StepFunctionsClient } from './stepFunctionsClient'
import { DefaultStsClient, StsClient } from './stsClient'
import { DefaultSsmDocumentClient, SsmDocumentClient } from './ssmDocumentClient'
import { DefaultS3Client, S3Client } from './s3Client'
import { RegionProvider } from '../regions/regionProvider'
import { DEFAULT_PARTITION } from '../regions/regionUtilities'
import { ClassToInterfaceType } from '../utilities/tsUtils'

export type ToolkitClientBuilder = ClassToInterfaceType<DefaultToolkitClientBuilder>
export class DefaultToolkitClientBuilder {
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
