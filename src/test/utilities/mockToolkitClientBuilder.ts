/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { CloudFormationClient } from '../../shared/clients/cloudFormationClient'
import { LambdaClient } from '../../shared/clients/lambdaClient'
import { ToolkitClientBuilder } from '../../shared/clients/toolkitClientBuilder'

export class MockToolkitClientBuilder implements ToolkitClientBuilder {
    public constructor(
        private readonly cloudFormationClient?: CloudFormationClient,
        private readonly lambdaClient?: LambdaClient
    ) {
    }

    public createCloudFormationClient(regionCode: string): CloudFormationClient {
        if (!this.cloudFormationClient) {
            throw new Error('No mock CloudFormationClient was provided')
        }

        return this.cloudFormationClient
    }

    public createLambdaClient(regionCode: string): LambdaClient {
        if (!this.lambdaClient) {
            throw new Error('No mock LambdaClient was provided')
        }

        return this.lambdaClient
    }
}
