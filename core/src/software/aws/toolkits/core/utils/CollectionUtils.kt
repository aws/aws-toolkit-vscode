// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.utils

/*
 * Replace with [kotlin.collections.buildMap] when experimental is removed
 */
fun <K, V> buildMap(builder: MutableMap<K, V>.() -> Unit): Map<K, V> = mutableMapOf<K, V>().apply(builder).toMap()

/*
 * <enum>.valueOf(item) will throw if item is not in the enum, which is really bad in some places
 * like settings, so make a version we get null back from that we can handle easier
 */
inline fun <reified T : Enum<T>> valueOfOrNull(name: String): T? = enumValues<T>().find { it.name == name }
