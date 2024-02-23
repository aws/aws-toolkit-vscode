// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs.insights

import software.aws.toolkits.core.ConnectionSettings
import java.time.Clock
import java.time.Instant
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.temporal.ChronoUnit
import java.util.Date

data class QueryDetails(
    val connectionSettings: ConnectionSettings,
    val logGroups: List<String>,
    val timeRange: TimeRange,
    val query: QueryString
) {
    fun getQueryRange(clock: Clock = Clock.systemUTC()) =
        when (timeRange) {
            is TimeRange.AbsoluteRange -> {
                StartEndInstant(timeRange.startDate.toInstant(), timeRange.endDate.toInstant())
            }
            is TimeRange.RelativeRange -> {
                val now = Instant.now(clock)
                StartEndInstant(
                    // Instant doesn't support minus(Week), so we need to explicitly use the ISO calendar system
                    // ZonedDateTime must be based off an temporal instance with a ZoneId
                    ZonedDateTime.from(now.atZone(ZoneId.systemDefault())).minus(timeRange.relativeTimeAmount, timeRange.relativeTimeUnit).toInstant(),
                    now
                )
            }
        }

    fun getQueryString() =
        when (query) {
            is QueryString.SearchTermQueryString -> {
                val regexTerm = query.searchTerm.replace("/", "\\/")

                "fields @timestamp, @message | filter @message like /$regexTerm/"
            }

            is QueryString.InsightsQueryString -> query.query
        }
}

sealed class QueryString {
    data class SearchTermQueryString(
        val searchTerm: String
    ) : QueryString()
    data class InsightsQueryString(
        val query: String
    ) : QueryString()
}

sealed class TimeRange {
    data class AbsoluteRange(
        val startDate: Date,
        val endDate: Date
    ) : TimeRange()
    data class RelativeRange(
        val relativeTimeAmount: Long,
        val relativeTimeUnit: ChronoUnit
    ) : TimeRange()
}

data class StartEndInstant(
    val start: Instant,
    val end: Instant
)
