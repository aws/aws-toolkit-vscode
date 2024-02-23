// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.model

import java.time.Instant
import kotlin.time.Duration.Companion.seconds
import kotlin.time.toKotlinDuration

data class JobHistoryItem(val moduleName: String, val status: String, val startTime: Instant, val runTime: java.time.Duration, val jobId: String) {
    operator fun get(col: Int): Any = when (col) {
        0 -> moduleName
        1 -> status
        2 -> startTime
        3 -> runTime.toKotlinDuration().inWholeSeconds.seconds.toString()
        4 -> jobId
        else -> throw IllegalArgumentException("Invalid column $col")
    }
}
