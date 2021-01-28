// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.utils

import software.amazon.awssdk.core.waiters.WaiterResponse

/**
 * Unwraps the last waiter result.
 *
 * If it was successful, return the SDK response.
 * If it was an error, throw it
 */
fun <T> WaiterResponse<T>.unwrapResponse(): T {
    val responseOrException = this.matched()
    if (responseOrException.response().isPresent) {
        return responseOrException.response().get()
    }
    if (responseOrException.exception().isPresent) {
        throw responseOrException.exception().get()
    }
    throw IllegalStateException("Waiter response handler is broken for $this")
}
