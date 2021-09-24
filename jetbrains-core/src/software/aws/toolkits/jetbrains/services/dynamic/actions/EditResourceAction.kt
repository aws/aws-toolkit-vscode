// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamic.actions

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.util.IconUtil
import software.aws.toolkits.jetbrains.services.dynamic.ViewEditableDynamicResourceVirtualFile
import software.aws.toolkits.resources.message

class EditResourceAction : AnAction() {
    override fun actionPerformed(e: AnActionEvent) {
        val file = e.getData(CommonDataKeys.PSI_FILE)?.virtualFile
        file?.isWritable = true
    }

    override fun update(e: AnActionEvent) {
        val file = e.getData(CommonDataKeys.PSI_FILE)?.virtualFile
        e.presentation.isEnabledAndVisible = file is ViewEditableDynamicResourceVirtualFile && !file.isWritable
        e.presentation.icon = IconUtil.getEditIcon()
        val virtualFile = file as? ViewEditableDynamicResourceVirtualFile ?: return
        e.presentation.text = message("dynamic_resources.edit_resource", virtualFile.dynamicResourceIdentifier.resourceIdentifier)
    }
}
