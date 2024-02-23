// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamodb

import software.amazon.awssdk.services.dynamodb.DynamoDbClient
import software.amazon.awssdk.services.dynamodb.model.ExecuteStatementRequest
import software.amazon.awssdk.services.dynamodb.model.ExecuteStatementResponse

object DynamoDbUtils {
    fun DynamoDbClient.executeStatementPaginator(request: ExecuteStatementRequest): Sequence<ExecuteStatementResponse> =
        // Partiql does not have paginators, do it manually
        generateSequence(
            seed = this.executeStatement(request.toBuilder().build()),
            nextFunction = {
                it.nextToken()?.let { token ->
                    this.executeStatement(request.toBuilder().nextToken(token).build())
                }
            },
        )
}
