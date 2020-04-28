// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution

import com.intellij.execution.configurations.ConfigurationTypeBase
import com.intellij.execution.configurations.ConfigurationTypeUtil
import icons.AwsIcons
import software.aws.toolkits.jetbrains.core.help.HelpIds
import software.aws.toolkits.jetbrains.services.lambda.LambdaHandlerResolver
import software.aws.toolkits.jetbrains.services.lambda.execution.local.LocalLambdaRunConfigurationFactory
import software.aws.toolkits.jetbrains.services.lambda.execution.remote.RemoteLambdaRunConfigurationFactory
import software.aws.toolkits.resources.message

class LambdaRunConfigurationType :
    ConfigurationTypeBase(
        "aws.lambda",
        message("lambda.service_name"),
        message("lambda.run_configuration.description"),
        AwsIcons.Resources.LAMBDA_FUNCTION
    ) {
    init {
        // Although it should work, isApplicable doesn't seem to work for locallambdarunconfigurationfactory
        // and it still shows up when it is not applicalbe. So we have to decide in the configuration to add it or not.
        // TODO see if this is resolvable
        if (LambdaHandlerResolver.supportedRuntimeGroups.isNotEmpty()) {
            addFactory(LocalLambdaRunConfigurationFactory(this))
        }
        addFactory(RemoteLambdaRunConfigurationFactory(this))
    }

    override fun getHelpTopic(): String? = HelpIds.RUN_DEBUG_CONFIGURATIONS_DIALOG.id

    companion object {
        fun getInstance() = ConfigurationTypeUtil.findConfigurationType(LambdaRunConfigurationType::class.java)
    }
}
