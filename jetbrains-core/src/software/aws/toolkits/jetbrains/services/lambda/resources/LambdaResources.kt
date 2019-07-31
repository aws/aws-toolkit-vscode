// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.resources

import software.amazon.awssdk.services.lambda.LambdaClient
import software.aws.toolkits.jetbrains.core.ClientBackedCachedResource

object LambdaResources {
    val LIST_FUNCTIONS = ClientBackedCachedResource(LambdaClient::class) { listFunctionsPaginator().functions().toList() }
}