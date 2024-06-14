// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.utils.test

import java.time.Duration
import java.time.Instant
import java.util.UUID
import java.util.concurrent.atomic.AtomicInteger
import kotlin.random.Random

fun aString(length: Int = Random.nextInt(5, 30)): String = UUID.randomUUID().toString().substring(length)

fun retryableAssert(
    timeout: Duration? = null,
    maxAttempts: Int? = null,
    interval: Duration = Duration.ofMillis(100),
    assertion: () -> Unit
) {
    val calculatedTimeout = timeout ?: maxAttempts?.let { Duration.ofMillis(it * (interval.toMillis() * 2)) } ?: Duration.ofSeconds(1)
    val expiry = Instant.now().plus(calculatedTimeout)
    val attempts = AtomicInteger(0)
    while (true) {
        try {
            assertion()
            return
        } catch (e: AssertionError) { // deliberately narrowed to an AssertionError - this is intended to be used in a test assertion
            when {
                Instant.now().isAfter(expiry) -> throw e
                maxAttempts != null && attempts.incrementAndGet() >= maxAttempts -> throw e
                else -> Thread.sleep(interval.toMillis())
            }
        }
    }
}
