// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs.insights

import software.aws.toolkits.core.ConnectionSettings
import java.time.temporal.ChronoUnit

object InsightsUtils {
    fun queryDetails(
        connectionSettings: ConnectionSettings,
        logGroups: List<String> = listOf("logGroup"),
        timeRange: TimeRange = TimeRange.RelativeRange(1, ChronoUnit.DAYS),
        query: QueryString = QueryString.InsightsQueryString("query")
    ) = QueryDetails(
        connectionSettings = connectionSettings,
        logGroups = logGroups,
        timeRange = timeRange,
        query = query
    )
}
