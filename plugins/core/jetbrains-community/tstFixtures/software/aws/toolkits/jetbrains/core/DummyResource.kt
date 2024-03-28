// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core

import software.aws.toolkits.core.ClientConnectionSettings
import software.aws.toolkits.core.utils.test.aString
import java.util.concurrent.atomic.AtomicInteger

open class DummyResource<T>(override val id: String, private val value: T) : Resource.Cached<T>() {
    val callCount = AtomicInteger(0)

    override fun fetch(connectionSettings: ClientConnectionSettings<*>): T {
        callCount.getAndIncrement()
        return value
    }
}

class StringResource(id: String) : DummyResource<String>(id, id)

fun dummyResource(value: String = aString()): Resource.Cached<String> = StringResource(value)
