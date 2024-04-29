// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.startup

import com.intellij.ide.plugins.marketplace.MarketplaceRequests
import com.intellij.openapi.extensions.PluginId
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.updateSettings.impl.PluginDownloader
import org.slf4j.LoggerFactory

private val LOG = LoggerFactory.getLogger("software.aws.toolkits.jetbrains.core.startup.PluginInstallUtil")

// can't reference anything not in IDE libraries
@Suppress("LazyLog")
internal fun lookForPluginToInstall(pluginId: PluginId, progressIndicator: ProgressIndicator): Boolean {
    try {
        // MarketplaceRequest class is marked as @ApiStatus.Internal
        val descriptor = MarketplaceRequests.loadLastCompatiblePluginDescriptors(setOf(pluginId))
            .find { it.pluginId == pluginId } ?: return false

        val downloader = PluginDownloader.createDownloader(descriptor)
        if (!downloader.prepareToInstall(progressIndicator)) return false
        downloader.install()
    } catch (e: Exception) {
        LOG.error("Unable to auto-install $pluginId", e)
        return false
    }
    return true
}
