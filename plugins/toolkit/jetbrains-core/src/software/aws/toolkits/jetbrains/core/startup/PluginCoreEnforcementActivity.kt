// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.startup

import com.intellij.ide.ApplicationInitializedListener
import com.intellij.ide.plugins.PluginEnabler
import com.intellij.ide.plugins.PluginManagerCore
import com.intellij.openapi.application.ex.ApplicationManagerEx
import com.intellij.openapi.extensions.PluginId
import com.intellij.openapi.progress.EmptyProgressIndicator
import kotlinx.coroutines.CoroutineScope
import org.slf4j.LoggerFactory

class PluginCoreEnforcementActivity : ApplicationInitializedListener {

    @Suppress("LazyLog")
    override suspend fun execute(asyncScope: CoroutineScope) {
        // can't reference anything in core
        val log = LoggerFactory.getLogger(this::class.java)

        val coreId = PluginId.getId("aws.toolkit.core")
        val coreDescriptor = PluginManagerCore.getPlugin(coreId)
        if (coreDescriptor != null) {
            if (!coreDescriptor.isEnabled) {
                PluginEnabler.getInstance().enable(listOf(coreDescriptor))
                ApplicationManagerEx.getApplicationEx().restart(true)
            }
            // already installed
            return
        }

        log.info("Attempting to install $coreId")
        if (lookForPluginToInstall(coreId, EmptyProgressIndicator())) {
            log.info("Successfully installed $coreId, restarting")
        } else {
            // missing core and therefore unsafe to continue
            val toolkit = PluginManagerCore.getPlugin(PluginId.getId("aws.toolkit"))
            if (toolkit == null) {
                log.info("Core is missing, but descriptor to disable toolkit was not found")
                return
            }
            log.info("Disabling $toolkit due to missing core dependency")
            PluginEnabler.getInstance().disable(listOf(toolkit))
        }

        ApplicationManagerEx.getApplicationEx().restart(true)
    }
}
