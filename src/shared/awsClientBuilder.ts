/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { ServiceConfigurationOptions } from 'aws-sdk/lib/service'

export interface AWSClientBuilder {
    createAndConfigureServiceClient<T>(
        awsServiceFactory: (options: ServiceConfigurationOptions) => T,
        awsServiceOpts?: ServiceConfigurationOptions,
        region?: string
    ): Promise<T>
}
