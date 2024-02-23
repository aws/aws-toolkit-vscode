// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.nodejs

import software.amazon.awssdk.services.lambda.model.Runtime

val SUPPORTED_NODE_RUNTIMES = listOf(
    arrayOf(Runtime.NODEJS14_X),
    arrayOf(Runtime.NODEJS16_X),
    arrayOf(Runtime.NODEJS18_X)
)
