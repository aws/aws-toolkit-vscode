// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils.rules

import com.intellij.openapi.util.registry.Registry
import com.intellij.openapi.util.registry.RegistryValue
import org.junit.jupiter.api.extension.AfterEachCallback
import org.junit.jupiter.api.extension.ExtensionContext

/**
 * [String] variant of [com.intellij.testFramework.RegistryKeyExtension] that handles multiple values
 */
class RegistryExtension : AfterEachCallback {
    private val oldValues = mutableMapOf<String, Pair<RegistryValue, String>>()

    override fun afterEach(context: ExtensionContext?) {
        oldValues.forEach { _, (key, value) -> key.setValue(value) }
    }

    fun setValue(key: String, value: String) {
        val (registryValue, _) = oldValues.computeIfAbsent(key) {
            val registryValue = Registry.get(it)

            registryValue to registryValue.asString()
        }

        registryValue.setValue(value)
    }
}
