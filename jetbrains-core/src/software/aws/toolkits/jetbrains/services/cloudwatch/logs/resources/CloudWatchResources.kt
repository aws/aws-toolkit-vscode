// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs.resources

import software.amazon.awssdk.services.cloudwatchlogs.CloudWatchLogsClient
import software.aws.toolkits.jetbrains.core.ClientBackedCachedResource

object CloudWatchResources {
    val LIST_LOG_GROUPS =
        ClientBackedCachedResource(CloudWatchLogsClient::class, "cwl.log_groups") {
            describeLogGroupsPaginator().logGroups().filterNotNull().toList()
        }
}
