// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamic.explorer.actions

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.DumbAware
import com.intellij.psi.codeStyle.CodeStyleManager
import com.intellij.psi.util.PsiUtilCore
import software.aws.toolkits.jetbrains.core.credentials.getConnectionSettingsOrThrow
import software.aws.toolkits.jetbrains.core.experiments.isEnabled
import software.aws.toolkits.jetbrains.core.explorer.actions.SingleExplorerNodeAction
import software.aws.toolkits.jetbrains.services.dynamic.CreateDynamicResourceVirtualFile
import software.aws.toolkits.jetbrains.services.dynamic.DynamicResourceSchemaMapping
import software.aws.toolkits.jetbrains.services.dynamic.JsonResourceModificationExperiment
import software.aws.toolkits.jetbrains.services.dynamic.explorer.DynamicResourceResourceTypeNode
import software.aws.toolkits.resources.message

class CreateResourceAction :
    SingleExplorerNodeAction<DynamicResourceResourceTypeNode>(message("dynamic_resources.type.explorer.create_resource")), DumbAware {

    override fun actionPerformed(selected: DynamicResourceResourceTypeNode, e: AnActionEvent) {
        val file = CreateDynamicResourceVirtualFile(
            selected.nodeProject.getConnectionSettingsOrThrow(),
            selected.value
        )
        // TODO: Populate the file with required properties in the schema

        DynamicResourceSchemaMapping.getInstance().addResourceSchemaMapping(selected.nodeProject, file)
        WriteCommandAction.runWriteCommandAction(selected.nodeProject) {
            CodeStyleManager.getInstance(selected.nodeProject).reformat(PsiUtilCore.getPsiFile(selected.nodeProject, file))
            FileEditorManager.getInstance(selected.nodeProject).openFile(file, true)
            file.isWritable = true
        }
    }

    override fun update(selected: DynamicResourceResourceTypeNode, e: AnActionEvent) {
        e.presentation.isEnabledAndVisible = JsonResourceModificationExperiment.isEnabled()
    }
}
