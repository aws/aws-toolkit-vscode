// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.remote

import com.intellij.execution.RunManager
import com.intellij.execution.RunnerAndConfigurationSettings
import com.intellij.execution.actions.ConfigurationContext
import com.intellij.execution.actions.LazyRunConfigurationProducer
import com.intellij.execution.configurations.ConfigurationFactory
import com.intellij.openapi.util.Ref
import com.intellij.psi.PsiElement
import software.aws.toolkits.jetbrains.core.credentials.ProjectAccountSettingsManager
import software.aws.toolkits.jetbrains.services.lambda.execution.LambdaRunConfigurationType

class RemoteLambdaRunConfigurationProducer : LazyRunConfigurationProducer<RemoteLambdaRunConfiguration>() {
    override fun getConfigurationFactory(): ConfigurationFactory = LambdaRunConfigurationType.getInstance()
        .configurationFactories
        .first { it is RemoteLambdaRunConfigurationFactory }

    // Filter all Lambda run configurations down to only ones that are Lambda remote for this run producer
    override fun getConfigurationSettingsList(runManager: RunManager): List<RunnerAndConfigurationSettings> =
        super.getConfigurationSettingsList(runManager).filter { it.configuration is RemoteLambdaRunConfiguration }

    override fun setupConfigurationFromContext(
        configuration: RemoteLambdaRunConfiguration,
        context: ConfigurationContext,
        sourceElement: Ref<PsiElement>
    ): Boolean {
        val location = context.location as? RemoteLambdaLocation ?: return false
        val function = location.lambdaFunction

        val accountSettings = ProjectAccountSettingsManager.getInstance(context.project)
        accountSettings.connectionSettings()?.let {
            configuration.credentialProviderId(it.credentials.id)
            configuration.regionId(it.region.id)
        }

        configuration.functionName(function.name)
        configuration.setGeneratedName()

        return true
    }

    override fun isConfigurationFromContext(
        configuration: RemoteLambdaRunConfiguration,
        context: ConfigurationContext
    ): Boolean {
        val location = context.location as? RemoteLambdaLocation ?: return false
        val function = location.lambdaFunction

        val accountSettings = ProjectAccountSettingsManager.getInstance(context.project)
        return accountSettings.connectionSettings()?.let {
            configuration.functionName() == function.name &&
                configuration.credentialProviderId() == it.credentials.id &&
                configuration.regionId() == it.region.id
        } ?: false
    }
}
