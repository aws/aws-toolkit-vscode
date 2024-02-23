// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer.devToolsTab.nodes.actions

import com.intellij.icons.AllIcons
import com.intellij.ide.BrowserUtil
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAwareAction
import software.aws.toolkits.jetbrains.services.caws.CawsEndpoints

class CawsLearnMore : DumbAwareAction(AllIcons.Actions.Help) {
    override fun actionPerformed(e: AnActionEvent) {
        BrowserUtil.browse(CawsEndpoints.ConsoleFactory.marketing())
    }
}
