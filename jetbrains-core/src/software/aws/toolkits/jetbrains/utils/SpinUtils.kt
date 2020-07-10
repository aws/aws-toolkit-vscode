// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import java.time.Duration

/**
 * Keeps checking the condition until the max duration as been reached. Checks every 100ms
 */
fun spinUntil(duration: Duration, condition: () -> Boolean) {
    val start = System.nanoTime()
    runBlocking {
        while (!condition()) {
            if (System.nanoTime() - start > duration.toNanos())
                throw IllegalStateException("Condition not reached within $duration")
            delay(100)
        }
    }
}

/**
 * Keeps running the function until it returns a non-null value. Checks every 100ms
 */
suspend fun <T> spinUntilResult(duration: Duration, func: () -> T?): T {
    val start = System.nanoTime()
    while (System.nanoTime() - start <= duration.toNanos()) {
        func()?.let {
            return it
        }

        delay(100)
    }
    throw IllegalStateException("Function did not return value within $duration")
}
