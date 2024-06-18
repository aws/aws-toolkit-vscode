// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.telemetry

import com.intellij.ide.plugins.PluginManagerCore
import software.amazon.awssdk.services.toolkittelemetry.model.AWSProduct

/**
 * Responsible for resolving the plugin descriptor and determining the AWS product
 * and version based on the stack trace of the calling thread or a provided stack trace.
 */
class PluginResolver private constructor(callerStackTrace: Array<StackTraceElement>) {
    private val pluginDescriptor by lazy {
        callerStackTrace
            .reversed()
            .filter { it.className.startsWith("software.aws.toolkits") }
            .firstNotNullOfOrNull { PluginManagerCore.getPluginDescriptorOrPlatformByClassName(it.className) }
    }

    val product: AWSProduct
        get() = when (pluginDescriptor?.pluginId?.idString) {
            "amazon.q" -> AWSProduct.AMAZON_Q_FOR_JET_BRAINS
            else -> AWSProduct.AWS_TOOLKIT_FOR_JET_BRAINS
        }

    val version: String
        get() = pluginDescriptor?.version ?: "unknown"

    companion object {
        private val threadLocalResolver = ThreadLocal<PluginResolver>()

        /**
         * Creates a new PluginResolver instance off the current thread's stack trace, or retrieves
         * the thread-local resolver if one is set.
         */
        fun fromCurrentThread() = threadLocalResolver.get() ?: PluginResolver(Thread.currentThread().stackTrace)

        /**
         * Creates a new PluginResolver instance from a provided stack trace.
         */
        fun fromStackTrace(stackTrace: Array<StackTraceElement>) = PluginResolver(stackTrace)

        /**
         * Sets a PluginResolver instance to a thread-local for the current thread.
         * This value will be retrieved by subsequent calls to fromCurrentThread.
         */
        fun setThreadLocal(value: PluginResolver) {
            threadLocalResolver.set(value)
        }
    }
}
