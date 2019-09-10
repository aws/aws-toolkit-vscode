// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains

import com.intellij.ide.plugins.PluginManager
import com.intellij.openapi.extensions.PluginId

object AwsToolkit {
    private const val PLUGIN_ID = "aws.toolkit"

    const val PLUGIN_NAME = "AWS Toolkit For JetBrains"

    val PLUGIN_VERSION: String by lazy {
        PluginManager.getPlugin(PluginId.getId(PLUGIN_ID))?.version ?: "Unknown"
    }
}
