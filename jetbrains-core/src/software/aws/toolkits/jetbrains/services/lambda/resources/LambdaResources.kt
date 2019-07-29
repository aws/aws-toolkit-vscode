// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.resources

import software.amazon.awssdk.services.lambda.LambdaClient
import software.amazon.awssdk.services.lambda.model.FunctionConfiguration
import software.aws.toolkits.jetbrains.core.CachedResourceBase
import software.aws.toolkits.jetbrains.core.CachedResource

object LambdaResources {
    val LIST_FUNCTIONS: CachedResource<List<FunctionConfiguration>> = LambdaCachedResource { listFunctionsPaginator().functions().toList() }

    private class LambdaCachedResource<T>(private val call: LambdaClient.() -> T) : CachedResourceBase<T, LambdaClient>(LambdaClient::class) {
        override fun fetch(client: LambdaClient): T = call(client)
    }
}