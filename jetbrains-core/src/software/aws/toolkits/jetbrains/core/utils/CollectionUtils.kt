// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.utils

/*
 * Replace with [kotlin.collections.buildList] when experimental is removed
 */
inline fun <E> buildList(builderAction: MutableList<E>.() -> Unit): List<E> = ArrayList<E>().apply(builderAction)
inline fun <E> buildList(capacity: Int, builderAction: MutableList<E>.() -> Unit): List<E> = ArrayList<E>(capacity).apply(builderAction)

/*
 * Replace with [kotlin.collections.buildMap] when experimental is removed
 */
inline fun <T, U> buildMap(builderAction: MutableMap<T, U>.() -> Unit): Map<T, U> = mutableMapOf<T, U>().apply(builderAction)
