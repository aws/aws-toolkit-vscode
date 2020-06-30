// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.utils

import org.jetbrains.annotations.TestOnly
import java.util.concurrent.CompletionStage
import java.util.concurrent.ExecutionException

// Wait for a completion stage to end, and throw the exception that caused it to fail
// if it fails.
@TestOnly
fun <T> CompletionStage<T>.unwrap(): T = try {
    this.toCompletableFuture().get()
} catch (e: ExecutionException) {
    throw e.cause ?: e
}
