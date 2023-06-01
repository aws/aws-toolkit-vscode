// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda

import java.util.concurrent.TimeUnit

// @see https://docs.aws.amazon.com/lambda/latest/dg/limits.html
object LambdaLimits {
    const val MIN_MEMORY = 128
    const val MAX_MEMORY = 10240
    const val MAX_FUNCTION_NAME_LENGTH = 64
    val FUNCTION_NAME_PATTERN = "[a-zA-Z0-9-_]+".toRegex()
    const val MEMORY_INCREMENT = 64
    const val DEFAULT_MEMORY_SIZE = 128
    const val MIN_TIMEOUT = 1

    @JvmField
    val MAX_TIMEOUT = TimeUnit.MINUTES.toSeconds(15).toInt()

    @JvmField
    val DEFAULT_TIMEOUT = TimeUnit.MINUTES.toSeconds(5).toInt()
}
