// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains

import com.intellij.ide.plugins.PluginManagerCore
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.extensions.PluginDescriptor
import com.intellij.openapi.extensions.PluginId
import java.nio.file.Paths

object AwsToolkit {
    const val PLUGIN_ID = "aws.toolkit"
    const val GITHUB_URL = "https://github.com/aws/aws-toolkit-jetbrains"
    const val AWS_DOCS_URL = "https://docs.aws.amazon.com/console/toolkit-for-jetbrains"

    val PLUGIN_VERSION: String by lazy {
        DESCRIPTOR?.version ?: "Unknown"
    }

    val DESCRIPTOR: PluginDescriptor? by lazy {
        PluginManagerCore.getPlugin(PluginId.getId(PLUGIN_ID))
    }

    fun pluginPath() = if (ApplicationManager.getApplication().isUnitTestMode) {
        Paths.get(System.getProperty("plugin.path"))
    } else {
        DESCRIPTOR?.pluginPath ?: throw RuntimeException("Toolkit root not available")
    }
}
