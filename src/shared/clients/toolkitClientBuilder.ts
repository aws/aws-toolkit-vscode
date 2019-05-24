/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { ServiceConfigurationOptions } from 'aws-sdk/lib/service'
import { CloudFormationClient } from './cloudFormationClient'
import { LambdaClient } from './lambdaClient'
import { StsClient } from './stsClient'

export interface ToolkitClientBuilder {
    createCloudFormationClient(regionCode: string): CloudFormationClient

    createLambdaClient(regionCode: string): LambdaClient

    createStsClient(regionCode: string, credentials?: ServiceConfigurationOptions): StsClient
}
