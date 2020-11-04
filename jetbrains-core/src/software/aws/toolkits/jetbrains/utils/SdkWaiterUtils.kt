// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

import software.amazon.awssdk.core.waiters.WaiterResponse

fun <T> WaiterResponse<T>.response(): T {
    val responseOrException = this.matched()
    if (responseOrException.response().isPresent) {
        return responseOrException.response().get()
    }
    if (responseOrException.exception().isPresent) {
        throw responseOrException.exception().get()
    }
    throw IllegalStateException("Waiter response handler is broken for $this")
}
