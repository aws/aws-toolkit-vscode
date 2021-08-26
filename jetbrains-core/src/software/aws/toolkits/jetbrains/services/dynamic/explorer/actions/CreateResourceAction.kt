// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamic.explorer.actions

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.DumbAware
import com.intellij.psi.codeStyle.CodeStyleManager
import com.intellij.psi.util.PsiUtilCore
import com.jetbrains.jsonSchema.JsonSchemaMappingsProjectConfiguration
import com.jetbrains.jsonSchema.ide.JsonSchemaService
import com.jetbrains.jsonSchema.impl.JsonSchemaServiceImpl
import software.aws.toolkits.jetbrains.core.credentials.AwsConnectionManager.Companion.getConnectionSettings
import software.aws.toolkits.jetbrains.core.explorer.actions.SingleExplorerNodeAction
import software.aws.toolkits.jetbrains.services.dynamic.CreateResourceFloatingProvider
import software.aws.toolkits.jetbrains.services.dynamic.DynamicResourceIdentifier
import software.aws.toolkits.jetbrains.services.dynamic.DynamicResourceVirtualFile
import software.aws.toolkits.jetbrains.services.dynamic.DynamicResources
import software.aws.toolkits.jetbrains.services.dynamic.explorer.DynamicResourceResourceTypeNode
import software.aws.toolkits.telemetry.DynamicresourceTelemetry

class DynamicResourceCreateResourceAction: SingleExplorerNodeAction<DynamicResourceResourceTypeNode>("Create Resource"), DumbAware {

    override fun actionPerformed(selected: DynamicResourceResourceTypeNode, e: AnActionEvent) {
        val file = DynamicResourceVirtualFile(DynamicResourceIdentifier(selected.nodeProject.getConnectionSettings(), selected.value, "Creating ${selected.value}..."), "{}" )
        val configuration = JsonSchemaMappingsProjectConfiguration.getInstance(selected.nodeProject).findMappingForFile(file)
        if(configuration == null){
            DynamicResources.resourceTypesInUse.add(selected.value)
            JsonSchemaService.Impl.get(selected.nodeProject).reset()
            JsonSchemaServiceImpl(selected.nodeProject).reset()
        }
        val toolbarProvider = CreateResourceFloatingProvider.getExtension()
        toolbarProvider.updateAllToolbarComponents()
        WriteCommandAction.runWriteCommandAction(selected.nodeProject) {
            CodeStyleManager.getInstance(selected.nodeProject).reformat(PsiUtilCore.getPsiFile(selected.nodeProject, file))
            FileEditorManager.getInstance(selected.nodeProject).openFile(file, true)
            file.isWritable = true

        }


    }

}
