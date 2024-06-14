// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.utils

sealed class Either<out L, out R> {
    data class Left<L>(val value: L) : Either<L, Nothing>()
    data class Right<R>(val value: R) : Either<Nothing, R>()
}

infix fun <L, R> L?.xor(other: R?): Either<L, R> = when {
    this != null && other == null -> Either.Left(this)
    this == null && other != null -> Either.Right(other)
    else -> throw IllegalArgumentException("Exactly one of $this or $other must be null")
}
