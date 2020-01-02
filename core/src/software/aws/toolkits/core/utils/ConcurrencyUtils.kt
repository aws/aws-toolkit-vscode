// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.utils

import java.util.concurrent.CompletableFuture
import java.util.concurrent.CompletionStage
import java.util.concurrent.Executors
import java.util.concurrent.RunnableFuture
import java.util.function.Supplier

fun <U> failedFuture(t: Throwable): CompletableFuture<U> = CompletableFuture<U>().also {
    it.completeExceptionally(t)
}

private val pool = Executors.newCachedThreadPool()
fun <T> RunnableFuture<T>.toCompletableFuture(): CompletableFuture<T> {
    run()

    return CompletableFuture.supplyAsync(Supplier { get() }, pool)
}

fun <T> Iterable<CompletionStage<T>>.allOf(): CompletionStage<Void> = CompletableFuture.allOf(*this.map { it.toCompletableFuture() }.toTypedArray())
