// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
@file:JvmName("ExceptionUtils")

package software.aws.toolkits.core.utils

/**
 * Convert exceptions raised from [block] to null
 */
fun <T> tryOrNull(block: () -> T): T? = try {
    block()
} catch (_: Exception) {
    null
}
