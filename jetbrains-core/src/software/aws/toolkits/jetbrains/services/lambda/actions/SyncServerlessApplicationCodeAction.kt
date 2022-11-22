// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.actions

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import icons.AwsIcons
import software.aws.toolkits.jetbrains.core.experiments.isEnabled
import software.aws.toolkits.jetbrains.services.lambda.LambdaHandlerResolver
import software.aws.toolkits.jetbrains.services.lambda.sam.SamTemplateFileUtils.getSamTemplateFile
import software.aws.toolkits.jetbrains.services.lambda.sam.sync.SyncServerlessApplicationCodeExperiment
import software.aws.toolkits.jetbrains.services.lambda.sam.sync.SyncServerlessApplicationExperiment
import software.aws.toolkits.resources.message

class SyncServerlessApplicationCodeAction : AnAction(message("serverless.application.sync.code"), null, AwsIcons.Resources.SERVERLESS_APP) {
    override fun actionPerformed(e: AnActionEvent) {
        SyncServerlessAppAction(true).actionPerformed(e)
    }

    override fun update(e: AnActionEvent) {
        super.update(e)
        e.presentation.isEnabledAndVisible =
            getSamTemplateFile(e) != null &&
            SyncServerlessApplicationCodeExperiment.isEnabled() &&
            SyncServerlessApplicationExperiment.isEnabled() &&
            LambdaHandlerResolver.supportedRuntimeGroups().isNotEmpty()
    }
}
