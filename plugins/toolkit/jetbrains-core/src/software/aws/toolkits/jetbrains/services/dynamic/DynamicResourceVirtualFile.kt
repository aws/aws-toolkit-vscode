// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamic

import com.intellij.json.JsonFileType
import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.Project
import com.intellij.psi.codeStyle.CodeStyleManager
import com.intellij.psi.util.PsiUtilCore
import com.intellij.testFramework.LightVirtualFile
import software.amazon.awssdk.services.cloudcontrol.CloudControlClient
import software.aws.toolkits.core.ConnectionSettings
import software.aws.toolkits.jetbrains.services.dynamic.explorer.OpenResourceModelSourceAction
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.DynamicresourceTelemetry

sealed class DynamicResourceVirtualFile(fileName: String, val dynamicResourceType: String, fileContent: String) :
    LightVirtualFile(
        fileName,
        JsonFileType.INSTANCE,
        fileContent
    )

class CreateDynamicResourceVirtualFile(val connectionSettings: ConnectionSettings, dynamicResourceType: String) :
    DynamicResourceVirtualFile(
        message("dynamic_resources.create_resource_file_name", dynamicResourceType),
        dynamicResourceType,
        InitialCreateDynamicResourceContent.initialContent
    )

class ViewEditableDynamicResourceVirtualFile(val dynamicResourceIdentifier: DynamicResourceIdentifier, fileContent: String) :
    DynamicResourceVirtualFile(
        CloudControlApiResources.getResourceDisplayName(dynamicResourceIdentifier.resourceIdentifier),
        dynamicResourceIdentifier.resourceType,
        fileContent
    )

object InitialCreateDynamicResourceContent {
    const val initialContent = "{}"
}

object OpenViewEditableDynamicResourceVirtualFile {
    fun openFile(project: Project, file: ViewEditableDynamicResourceVirtualFile, sourceAction: OpenResourceModelSourceAction, resourceType: String) {
        WriteCommandAction.runWriteCommandAction(project) {
            CodeStyleManager.getInstance(project).reformat(PsiUtilCore.getPsiFile(project, file))
            if (sourceAction == OpenResourceModelSourceAction.READ) {
                file.isWritable = false
                DynamicresourceTelemetry.getResource(project, success = true, resourceType = resourceType)
            } else if (sourceAction == OpenResourceModelSourceAction.EDIT) {
                file.isWritable = true
            }
            FileEditorManager.getInstance(project).openFile(file, true)
        }
    }

    fun getResourceModel(project: Project, client: CloudControlClient, resourceType: String, resourceIdentifier: String): String? = try {
        client.getResource {
            it.typeName(resourceType)
            it.identifier(resourceIdentifier)
        }
            .resourceDescription()
            .properties()
    } catch (e: Exception) {
        notifyError(
            project = project,
            title = message("dynamic_resources.fetch.fail.title"),
            content = message("dynamic_resources.fetch.fail.content", resourceIdentifier)
        )
        DynamicresourceTelemetry.getResource(project, success = false, resourceType = resourceType)
        null
    }
}
