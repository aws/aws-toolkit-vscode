// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.resources

import software.amazon.awssdk.services.lambda.LambdaClient
import software.aws.toolkits.jetbrains.core.ClientBackedCachedResource
import software.aws.toolkits.jetbrains.core.Resource

object LambdaResources {
    val LIST_FUNCTIONS = ClientBackedCachedResource(LambdaClient::class, "lambda.list_functions") {
        listFunctionsPaginator().functions().toList()
    }

    fun function(arn: String) = Resource.View(LIST_FUNCTIONS) { find { it.functionArn() == arn } }
}