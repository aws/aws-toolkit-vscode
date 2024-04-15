// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains

import com.intellij.ide.plugins.PluginManagerCore
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.extensions.PluginDescriptor
import com.intellij.openapi.extensions.PluginId
import java.nio.file.Path
import java.nio.file.Paths
import java.util.EnumMap

object AwsToolkit {
    const val TOOLKIT_PLUGIN_ID = "aws.toolkit"
    const val Q_PLUGIN_ID = "amazon.q"
    const val CORE_PLUGIN_ID = "aws.toolkit.core"

    private val TOOLKIT_PLUGIN_INFO = PluginInfo(TOOLKIT_PLUGIN_ID, "AWS Toolkit")
    private val Q_PLUGIN_INFO = PluginInfo(Q_PLUGIN_ID, "Amazon Q")
    private val CORE_PLUGIN_INFO = PluginInfo(CORE_PLUGIN_ID, "AWS Plugin Core")

    val PLUGINS_INFO = EnumMap<AwsPlugin, PluginInfo>(AwsPlugin::class.java).apply {
        put(AwsPlugin.TOOLKIT, TOOLKIT_PLUGIN_INFO)
        put(AwsPlugin.Q, Q_PLUGIN_INFO)
        put(AwsPlugin.CORE, CORE_PLUGIN_INFO)
    }

    const val GITHUB_URL = "https://github.com/aws/aws-toolkit-jetbrains"
    const val AWS_DOCS_URL = "https://docs.aws.amazon.com/console/toolkit-for-jetbrains"
}

data class PluginInfo(val id: String, val name: String) {
    val descriptor: PluginDescriptor?
        get() = PluginManagerCore.getPlugin(PluginId.getId(id))
    val version: String = descriptor?.version ?: "Unknown"
    val path: Path?
        get() =
            if (ApplicationManager.getApplication().isUnitTestMode) {
                Paths.get(System.getProperty("plugin.path"))
            } else {
                descriptor?.pluginPath
            }
}

enum class AwsPlugin {
    TOOLKIT,
    Q,
    CORE
}
