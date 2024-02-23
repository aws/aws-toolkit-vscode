// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.plugins

import com.intellij.ide.plugins.PluginManagerCore.getPlugin
import com.intellij.openapi.extensions.PluginId

// TODO: all usages should probably be leveraging EPs
fun pluginIsInstalledAndEnabled(pluginId: String): Boolean = getPlugin(PluginId.findId(pluginId))?.isEnabled == true
