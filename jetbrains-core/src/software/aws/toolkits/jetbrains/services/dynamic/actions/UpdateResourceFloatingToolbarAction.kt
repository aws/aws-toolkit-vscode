// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamic.actions

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.util.IconUtil
import software.aws.toolkits.jetbrains.services.dynamic.DynamicResourceVirtualFile
import software.aws.toolkits.jetbrains.services.dynamic.ViewEditableDynamicResourceVirtualFile

class UpdateResourceFloatingToolbarAction : DumbAwareAction() {
    override fun actionPerformed(e: AnActionEvent) {
        val file = e.getData(CommonDataKeys.PSI_FILE)?.virtualFile
        file?.isWritable = true
    }

    override fun update(e: AnActionEvent) {
        val file = e.getData(CommonDataKeys.PSI_FILE)?.virtualFile as? ViewEditableDynamicResourceVirtualFile ?: return
        e.presentation.isEnabledAndVisible = file is DynamicResourceVirtualFile && !file.isWritable
        e.presentation.icon = IconUtil.getEditIcon()
        e.presentation.text = "Edit ${file.dynamicResourceIdentifier.resourceIdentifier}"
    }
}
