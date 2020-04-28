// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.ecs.execution

import com.intellij.execution.configurations.ConfigurationTypeUtil
import com.intellij.execution.configurations.RunConfiguration
import com.intellij.execution.configurations.SimpleConfigurationType
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.NotNullLazyValue
import icons.AwsIcons
import software.aws.toolkits.jetbrains.core.help.HelpIds
import software.aws.toolkits.jetbrains.services.clouddebug.DebuggerSupport
import software.aws.toolkits.resources.message

class EcsCloudDebugRunConfigurationType : SimpleConfigurationType(
    "aws.ecs.cloud-debug",
    message("cloud_debug.ecs.run_config.name"),
    message("cloud_debug.ecs.run_config.description"),
    NotNullLazyValue.createConstantValue(AwsIcons.Resources.Ecs.ECS_SERVICE)
) {
    override fun createTemplateConfiguration(project: Project): RunConfiguration =
        EcsCloudDebugRunConfiguration(project, this)

    override fun getHelpTopic(): String? = HelpIds.CLOUD_DEBUG_RUN_CONFIGURATION.id
    override fun isApplicable(project: Project): Boolean = DebuggerSupport.debuggers().isNotEmpty()

    companion object {
        fun getInstance() = ConfigurationTypeUtil.findConfigurationType(EcsCloudDebugRunConfigurationType::class.java)
    }
}
