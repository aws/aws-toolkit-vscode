// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.utils

import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ConcurrentMap

data class AttributeBagKey<T> private constructor(val key: String) {
    companion object {
        private val map: ConcurrentMap<String, AttributeBagKey<*>> = ConcurrentHashMap()

        @Suppress("UNCHECKED_CAST")
        fun <T> create(name: String): AttributeBagKey<T> = map.computeIfAbsent(name) {
            AttributeBagKey<T>(name)
        } as AttributeBagKey<T>
    }
}

class AttributeBag {
    private val data = mutableMapOf<String, Any>()

    fun <T : Any> putData(key: AttributeBagKey<T>, value: T) {
        data.put(key.key, value)
    }

    @Suppress("UNCHECKED_CAST")
    fun <T> get(key: AttributeBagKey<T>): T? = data[key.key]?.let { it as T }

    fun <T> getOrThrow(key: AttributeBagKey<T>): T = get(key)
        ?: throw NoSuchElementException("Required element $key not found in AttributeBag")
}
