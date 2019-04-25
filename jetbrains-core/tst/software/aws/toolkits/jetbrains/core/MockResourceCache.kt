// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core

import software.aws.toolkits.jetbrains.services.lambda.LambdaFunction
import java.util.concurrent.CompletableFuture

class MockResourceCache : AwsResourceCache {
    override fun lambdaFunctions(): CompletableFuture<List<LambdaFunction>> =
        CompletableFuture.completedFuture(emptyList())
}
