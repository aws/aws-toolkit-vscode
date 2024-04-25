// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.telemetry

import com.intellij.ide.plugins.PluginManagerCore
import software.amazon.awssdk.services.toolkittelemetry.model.AWSProduct

class PluginResolver private constructor(callerStackTrace: Array<StackTraceElement>) {
    private val pluginDescriptor by lazy {
        callerStackTrace
            .reversed()
            .filter { it.className.startsWith("software.aws.toolkits") }
            .firstNotNullOfOrNull { PluginManagerCore.getPluginDescriptorOrPlatformByClassName(it.className) }
    }

    val product: AWSProduct
        get() = when (pluginDescriptor?.name) {
            "amazon.q" -> AWSProduct.AMAZON_Q_FOR_JET_BRAINS
            else -> AWSProduct.AWS_TOOLKIT_FOR_JET_BRAINS
        }

    val version: String
        get() = pluginDescriptor?.version ?: "unknown"

    companion object {
        fun fromCurrentThread() = PluginResolver(Thread.currentThread().stackTrace)

        fun fromStackTrace(stackTrace: Array<StackTraceElement>) = PluginResolver(stackTrace)
    }
}
