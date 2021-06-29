// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains

import com.intellij.ide.plugins.PluginManagerCore
import com.intellij.openapi.extensions.PluginId
import com.intellij.openapi.util.registry.Registry

object AwsToolkit {
    private const val PLUGIN_ID = "aws.toolkit"

    val PLUGIN_VERSION: String by lazy {
        PluginManagerCore.getPlugin(PluginId.getId(PLUGIN_ID))?.version ?: "Unknown"
    }

    fun isCloudDebugEnabled() = Registry.`is`("aws.feature.ecsCloudDebug")

    fun isEcsExecEnabled() = Registry.`is`("aws.feature.ecsExec")
}
