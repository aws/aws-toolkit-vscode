// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.utils

import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import software.amazon.awssdk.awscore.exception.AwsServiceException
import java.time.Duration
import java.time.Instant
import java.util.concurrent.CompletionException
import kotlin.math.min
import kotlin.reflect.KClass

object Waiters {
    private val LOG = getLogger<Waiters>()

    /**
     * Creates a waiter that attempts executing the provided [call] until the specified conditions are met.
     *
     * @param T The response type of the [call]
     * @param succeedOn The condition on the response under which the thing we are trying is complete. Defaults to if the call succeeds, we stop wating
     * @param failOn The condition on the response under which the thing we are trying has already failed and further attempts are pointless. Defaults to always try again
     * @param exceptionsToStopOn The exception types that should be considered a success and stop waiting. Default to never stop on any exception
     * @param exceptionsToIgnore The exception types that should be ignored if the thing we are trying throws them. Default to not ignoring any exceptions and let it bubble out
     * @param maxDuration The max amount of time we want to wait for
     * @param call The function we want to keep retrying
     */
    fun <T> waitUntilBlocking(
        succeedOn: (T) -> Boolean = { true },
        failOn: (T) -> Boolean = { false },
        exceptionsToStopOn: Set<KClass<out Exception>> = emptySet(),
        exceptionsToIgnore: Set<KClass<out Exception>> = emptySet(),
        maxDuration: Duration = Duration.ofMinutes(1),
        // The status pulling method to get the latest resource
        call: () -> T
    ): T? = runBlocking {
        waitUntil(succeedOn, failOn, exceptionsToStopOn, exceptionsToIgnore, maxDuration, call)
    }

    /**
     * Creates a waiter that attempts executing the provided [call] until the specified conditions are met.
     *
     * @param T The response type of the [call]
     * @param succeedOn The condition on the response under which the thing we are trying is complete. Defaults to if the call succeeds, we stop wating
     * @param failOn The condition on the response under which the thing we are trying has already failed and further attempts are pointless. Defaults to always try again
     * @param exceptionsToStopOn The exception types that should be considered a success and stop waiting. Default to never stop on any exception
     * @param exceptionsToIgnore The exception types that should be ignored if the thing we are trying throws them. Default to not ignoring any exceptions and let it bubble out
     * @param maxDuration The max amount of time we want to wait for
     * @param call The function we want to keep retrying
     */
    suspend fun <T> waitUntil(
        succeedOn: (T) -> Boolean = { true },
        failOn: (T) -> Boolean = { false },
        exceptionsToStopOn: Set<KClass<out Exception>> = emptySet(),
        exceptionsToIgnore: Set<KClass<out Exception>> = emptySet(),
        maxDuration: Duration = Duration.ofMinutes(1),
        // The status pulling method to get the latest resource
        call: () -> T
    ): T? {
        val start = Instant.now()
        var attempt = 0

        while (Duration.between(start, Instant.now()) < maxDuration) {
            attempt++

            try {
                val result = call()
                if (succeedOn.invoke(result)) {
                    LOG.info { "Got expected response: $result" }
                    return result
                }

                if (failOn.invoke(result)) {
                    throw WaiterUnrecoverableException("Received a response that matched the failOn predicate: $result")
                }

                LOG.info { "Attempt $attempt failed predicate." }
            } catch (e: WaiterUnrecoverableException) {
                throw e
            } catch (e: Exception) {
                val cause = if (e is CompletionException) {
                    e.cause ?: e
                } else {
                    e
                }

                if (cause::class in exceptionsToStopOn) {
                    LOG.info { "Got expected exception: ${cause::class}" }
                    return null
                }

                if (cause::class in exceptionsToIgnore) {
                    LOG.info { "Attempt $attempt failed with an expected exception (${cause::class})" }
                } else {
                    throw e
                }
            }

            delay(calculateBackOffMs(attempt))
        }

        throw WaiterTimeoutException("Condition was not met after $attempt attempts (${Duration.between(start, Instant.now()).seconds} seconds)")
    }

    private fun calculateBackOffMs(attempt: Int) = 250L shl min(attempt - 1, 4) // Exponential backoff: Max = 250 * 2^4 = 4_000
}

/**
 * Generic waiter method to wait for a certain AWS resource to be in a steady status until it reaches in a failed status
 * or time out for pulling.
 * @param T The AWS resource type for querying the status from it
 */
// TODO: Migrate off of, this should not expose strings on errors
@Deprecated("Exposes localized strings, use waitUntil")
fun <T> wait(
    // The status pulling method to get the latest resource
    call: () -> T,
    // The success predicate based on the returned resource
    success: (T) -> Boolean,
    // The fail predicate based on the returned resource. Return an error message if it fails, null otherwise
    fail: (T) -> String?,
    // The success predicate based on the exception thrown
    successByException: (AwsServiceException) -> Boolean = { false },
    // The fail predicate based on the exception thrown. Return an error message if it fails, null otherwise.
    failByException: (AwsServiceException) -> String? = { null },
    // The error message for timeout this pulling process.
    timeoutErrorMessage: String = "Timeout for transitioning the resource to be in the desired state.",
    // The maximum attempt for pulling the resource
    attempts: Int,
    // A fixed time interval between the pulling
    delay: Duration
) {
    repeat(attempts) {
        try {
            val result = call()
            val errorMessage = fail(result)
            when {
                success(result) -> return
                errorMessage != null -> throw WaiterUnrecoverableException(errorMessage)
                else -> Thread.sleep(delay.toMillis())
            }
        } catch (e: AwsServiceException) {
            val errorMessage = failByException(e)
            when {
                successByException(e) -> return
                errorMessage != null -> throw WaiterUnrecoverableException(errorMessage)
                else -> throw e
            }
        }
    }
    throw WaiterTimeoutException(timeoutErrorMessage)
}

class WaiterTimeoutException(message: String) : Exception(message)

class WaiterUnrecoverableException(message: String) : Exception(message)
