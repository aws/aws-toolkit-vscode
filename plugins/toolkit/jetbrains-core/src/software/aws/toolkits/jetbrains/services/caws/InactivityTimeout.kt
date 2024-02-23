// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.caws

import software.aws.toolkits.resources.message
import java.time.Duration

data class InactivityTimeout(val duration: Duration) : Comparable<InactivityTimeout> {
    fun displayText() = if (duration.isZero) {
        message("caws.workspace.details.no_timeout")
    } else if (duration.toMinutesPart() == 0) {
        message("date.in.n.hours", duration.toHours())
    } else {
        message("date.in.n.minutes", duration.toMinutes())
    }

    fun asMinutes() = duration.toMinutes().toInt()

    override fun compareTo(other: InactivityTimeout): Int = duration.compareTo(other.duration)

    companion object {
        val DEFAULT_TIMEOUT = InactivityTimeout(Duration.ofMinutes(15))
        val DEFAULT_VALUES = arrayOf(
            InactivityTimeout(Duration.ofMinutes(0)),
            DEFAULT_TIMEOUT,
            InactivityTimeout(Duration.ofMinutes(30)),
            InactivityTimeout(Duration.ofMinutes(45)),
            InactivityTimeout(Duration.ofHours(1)),
            InactivityTimeout(Duration.ofHours(2)),
            InactivityTimeout(Duration.ofHours(4)),
            InactivityTimeout(Duration.ofHours(8))
        )

        fun fromMinutes(minutes: Int) = InactivityTimeout(Duration.ofMinutes(minutes.toLong()))
    }
}
