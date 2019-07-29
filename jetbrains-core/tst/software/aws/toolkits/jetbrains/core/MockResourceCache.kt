// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core

import com.intellij.openapi.components.ServiceManager
import com.intellij.openapi.project.Project
import software.aws.toolkits.jetbrains.services.lambda.LambdaFunction
import java.util.concurrent.CompletableFuture

class MockResourceCache : AwsResourceCache {
    val lambdaFuture = CompletableFuture<List<LambdaFunction>>()

    override fun lambdaFunctions(): CompletableFuture<List<LambdaFunction>> = lambdaFuture

    companion object {
        @JvmStatic
        fun getInstance(project: Project): MockResourceCache =
            ServiceManager.getService(project, AwsResourceCache::class.java) as MockResourceCache
    }
}
