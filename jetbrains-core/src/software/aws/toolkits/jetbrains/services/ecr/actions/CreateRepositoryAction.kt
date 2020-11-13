// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.ecr.actions

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.LangDataKeys
import com.intellij.openapi.project.DumbAwareAction
import software.amazon.awssdk.services.ecr.EcrClient
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.services.ecr.CreateEcrRepoDialog
import software.aws.toolkits.resources.message

class CreateRepositoryAction : DumbAwareAction(message("ecr.create.repo.action")) {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.getRequiredData(LangDataKeys.PROJECT)
        val client: EcrClient = project.awsClient()
        CreateEcrRepoDialog(project, client).show()
    }
}
