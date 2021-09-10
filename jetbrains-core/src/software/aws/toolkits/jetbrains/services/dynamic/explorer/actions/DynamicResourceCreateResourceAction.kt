// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamic.explorer.actions

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.DumbAware
import com.intellij.psi.codeStyle.CodeStyleManager
import com.intellij.psi.util.PsiUtilCore
import software.aws.toolkits.jetbrains.core.credentials.AwsConnectionManager.Companion.getConnectionSettings
import software.aws.toolkits.jetbrains.core.explorer.actions.SingleExplorerNodeAction
import software.aws.toolkits.jetbrains.services.dynamic.DynamicResourceIdentifier
import software.aws.toolkits.jetbrains.services.dynamic.DynamicResourceSchemaMapping
import software.aws.toolkits.jetbrains.services.dynamic.DynamicResourceVirtualFile
import software.aws.toolkits.jetbrains.services.dynamic.explorer.DynamicResourceResourceTypeNode
import software.aws.toolkits.resources.message

class DynamicResourceCreateResourceAction() :
    SingleExplorerNodeAction<DynamicResourceResourceTypeNode>(message("dynamic_resources.create_resource")), DumbAware {

    override fun actionPerformed(selected: DynamicResourceResourceTypeNode, e: AnActionEvent) {
        val file = DynamicResourceVirtualFile(
            DynamicResourceIdentifier(
                selected.nodeProject.getConnectionSettings(),
                selected.value,
                selected.value
            ),
            message("dynamic_resources.create_resource_file_initial_content"), // TODO: Generate a schema with the required properties
            isResourceCreate = true
        )
        DynamicResourceSchemaMapping.getInstance().addResourceSchemaMapping(selected.nodeProject, file)
        WriteCommandAction.runWriteCommandAction(selected.nodeProject) {
            CodeStyleManager.getInstance(selected.nodeProject).reformat(PsiUtilCore.getPsiFile(selected.nodeProject, file))
            FileEditorManager.getInstance(selected.nodeProject).openFile(file, true)
            file.isWritable = true
        }
    }
}
