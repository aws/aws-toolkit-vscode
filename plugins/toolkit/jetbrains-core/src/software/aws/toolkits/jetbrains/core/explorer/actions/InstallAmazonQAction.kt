// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer.actions

import com.intellij.icons.AllIcons
import com.intellij.ide.plugins.PluginManagerConfigurable
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.options.ShowSettingsUtil
import software.aws.toolkits.resources.AwsToolkitBundle.message
import software.aws.toolkits.telemetry.UiTelemetry

class InstallAmazonQAction : AnAction(message("codewhisperer.explorer.node.install_q"), null, AllIcons.Actions.Install) {
    override fun actionPerformed(e: AnActionEvent) {
        ShowSettingsUtil.getInstance().showSettingsDialog(
            e.project,
            PluginManagerConfigurable::class.java
        ) { configurable: PluginManagerConfigurable ->
            configurable.openMarketplaceTab("Amazon Q")
        }
        UiTelemetry.click(e.project, "aws_installAmazonQ")
    }
}
