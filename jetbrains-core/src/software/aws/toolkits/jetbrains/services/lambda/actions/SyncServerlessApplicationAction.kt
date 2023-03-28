// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.actions

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import icons.AwsIcons
import software.aws.toolkits.jetbrains.services.lambda.LambdaHandlerResolver
import software.aws.toolkits.jetbrains.services.lambda.sam.SamTemplateFileUtils.getSamTemplateFile
import software.aws.toolkits.resources.message

class SyncServerlessApplicationAction : AnAction(message("serverless.application.sync"), null, AwsIcons.Resources.SERVERLESS_APP) {
    override fun actionPerformed(e: AnActionEvent) {
        SyncServerlessAppAction().actionPerformed(e)
    }

    override fun update(e: AnActionEvent) {
        super.update(e)
        e.presentation.isEnabledAndVisible = getSamTemplateFile(e) != null &&
            LambdaHandlerResolver.supportedRuntimeGroups().isNotEmpty()
    }
}
