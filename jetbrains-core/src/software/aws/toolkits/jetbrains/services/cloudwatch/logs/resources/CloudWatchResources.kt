// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs.resources

import software.amazon.awssdk.services.cloudwatchlogs.CloudWatchLogsClient
import software.amazon.awssdk.services.cloudwatchlogs.model.QueryDefinition
import software.aws.toolkits.jetbrains.core.ClientBackedCachedResource

object CloudWatchResources {
    val LIST_LOG_GROUPS =
        ClientBackedCachedResource(CloudWatchLogsClient::class, "cwl.log_groups") {
            describeLogGroupsPaginator().logGroups().filterNotNull().toList()
        }

    val DESCRIBE_QUERY_DEFINITIONS =
        ClientBackedCachedResource(CloudWatchLogsClient::class, "cwl.query_definitions") {
            // unfortunately there is no paginator for this
            sequence<QueryDefinition> {
                var token: String? = null
                do {
                    val result = describeQueryDefinitions {
                        it.nextToken(token)
                    }
                    token = result.nextToken()
                    yieldAll(result.queryDefinitions())
                } while (token != null)
            }.toList()
        }
}
