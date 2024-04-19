// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

import kotlinx.coroutines.delay
import kotlinx.coroutines.withTimeoutOrNull

suspend fun <T> pollFor(func: () -> T): T? {
    val timeoutMillis = 50000L

    val result = withTimeoutOrNull(timeoutMillis) {
        while (true) {
            val result = func()
            if (result != null) {
                return@withTimeoutOrNull result
            }

            delay(50L)
        }
        null
    }

    return result
}
