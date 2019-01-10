/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { CloudFormationClient } from './cloudFormationClient'
import { DefaultCloudFormationClient } from './defaultCloudFormationClient'
import { DefaultLambdaClient } from './defaultLambdaClient'
import { LambdaClient } from './lambdaClient'
import { ToolkitClientBuilder } from './toolkitClientBuilder'

export class DefaultToolkitClientBuilder implements ToolkitClientBuilder {
    public createCloudFormationClient(regionCode: string): CloudFormationClient {
        return new DefaultCloudFormationClient(regionCode)
    }

    public createLambdaClient(regionCode: string): LambdaClient {
        return new DefaultLambdaClient(regionCode)
    }
}
