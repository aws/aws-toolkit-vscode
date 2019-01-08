// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core

import software.aws.toolkits.jetbrains.services.lambda.LambdaFunction

class MockResourceCache : AwsResourceCache {
    override fun lambdaFunctions(): List<LambdaFunction> = emptyList()
}
