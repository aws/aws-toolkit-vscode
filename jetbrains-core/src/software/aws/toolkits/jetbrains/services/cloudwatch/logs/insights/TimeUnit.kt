// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs.insights

import software.aws.toolkits.resources.message
import java.time.temporal.ChronoUnit

enum class TimeUnit(val unit: ChronoUnit, val text: String) {
    MINUTES(ChronoUnit.MINUTES, message("cloudwatch.logs.time_minutes")),
    HOURS(ChronoUnit.HOURS, message("cloudwatch.logs.time_hours")),
    DAYS(ChronoUnit.DAYS, message("cloudwatch.logs.time_days")),
    WEEKS(ChronoUnit.WEEKS, message("cloudwatch.logs.time_weeks"))
}
