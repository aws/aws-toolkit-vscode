// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.uitests.utils

import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import java.time.Duration

fun recheckAssert(
    timeout: Duration = Duration.ofSeconds(1),
    interval: Duration = Duration.ofMillis(100),
    assertion: () -> Unit
) {
    runBlocking {
        withTimeout(timeout.toMillis()) {
            while (true) {
                try {
                    assertion()
                    return@withTimeout
                } catch (e: AssertionError) { // deliberately narrowed to an AssertionError - this is intended to be used in a test assertion
                    delay(interval.toMillis())
                }
            }
        }
    }
}

fun reattemptAssert(
    maxAttempts: Int = 5,
    interval: Duration = Duration.ofMillis(100),
    assertion: () -> Unit
) {
    var attempts = 0
    while (true) {
        try {
            assertion()
            return
        } catch (e: AssertionError) { // deliberately narrowed to an AssertionError - this is intended to be used in a test assertion
            when {
                ++attempts >= maxAttempts -> throw e
                else -> Thread.sleep(interval.toMillis())
            }
        }
    }
}
