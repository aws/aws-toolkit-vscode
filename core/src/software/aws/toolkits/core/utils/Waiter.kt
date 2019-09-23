// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.utils

import software.amazon.awssdk.awscore.exception.AwsServiceException
import java.time.Duration

/**
 * Generic waiter method to wait for a certain AWS resource to be in a steady status until it reaches in a failed status
 * or time out for pulling.
 * @param T The AWS resource type for querying the status from it
 */
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

class WaiterTimeoutException(message: String) : RuntimeException(message)

class WaiterUnrecoverableException(message: String) : RuntimeException(message)
