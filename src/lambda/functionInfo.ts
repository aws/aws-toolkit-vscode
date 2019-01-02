/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import Lambda = require('aws-sdk/clients/lambda')

export interface FunctionInfo {
    configuration: Lambda.FunctionConfiguration,
    client: Lambda
}
