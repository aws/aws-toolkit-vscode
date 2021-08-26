// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamic.actions

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.intellij.icons.AllIcons
import com.intellij.openapi.Disposable
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.util.IconUtil
import kotlinx.coroutines.launch
import org.gradle.internal.impldep.com.google.api.client.json.JsonString
import software.amazon.awssdk.services.cloudformation.CloudFormationClient
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.services.dynamic.DynamicResourceVirtualFile
import software.aws.toolkits.jetbrains.utils.ApplicationThreadPoolScope

class CreateResourceFloatingToolbarAction: DumbAwareAction(), Disposable {
    val coroutineScope = ApplicationThreadPoolScope("CreateResource", this)
    override fun actionPerformed(e: AnActionEvent) {
        val psiFile = e.getData(CommonDataKeys.PSI_FILE)
        val file = e.getData(CommonDataKeys.PSI_FILE)?.virtualFile
        if(file is DynamicResourceVirtualFile) {
            val resourceType = file.getResourceIdentifier().resourceType
            coroutineScope.launch {
                e.project?.awsClient<CloudFormationClient>()?.createResource{
                    it.typeName(resourceType)
                    it.desiredState(psiFile?.text)
            }
            }

        }
    }

    override fun update(e: AnActionEvent) {
        val file = e.getData(CommonDataKeys.PSI_FILE)?.virtualFile
        e.presentation.isEnabledAndVisible = file is DynamicResourceVirtualFile && file.name == "Creating ${file.getResourceIdentifier().resourceType}..."
        e.presentation.icon = AllIcons.Actions.Menu_saveall
        e.presentation.text = "Create Resource"
    }

    override fun dispose() {
        TODO("Not yet implemented")
    }
}
