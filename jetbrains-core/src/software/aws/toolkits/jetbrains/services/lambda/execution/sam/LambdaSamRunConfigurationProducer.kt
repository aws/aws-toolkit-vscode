// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.sam

import com.intellij.execution.RunManager
import com.intellij.execution.RunnerAndConfigurationSettings
import com.intellij.execution.actions.ConfigurationContext
import com.intellij.execution.actions.RunConfigurationProducer
import com.intellij.execution.configurations.ConfigurationFactory
import com.intellij.openapi.roots.ModuleRootManager
import com.intellij.openapi.roots.ProjectRootManager
import com.intellij.openapi.util.Ref
import com.intellij.psi.PsiElement
import software.aws.toolkits.jetbrains.services.lambda.LambdaHandlerResolver
import software.aws.toolkits.jetbrains.services.lambda.RuntimeGroup
import software.aws.toolkits.jetbrains.services.lambda.execution.LambdaRunConfiguration
import software.aws.toolkits.jetbrains.services.lambda.runtimeGroup

class LambdaSamRunConfigurationProducer : RunConfigurationProducer<SamRunConfiguration>(getFactory()) {
    override fun getConfigurationSettingsList(runManager: RunManager): List<RunnerAndConfigurationSettings> {
        // Filter all Lambda run CONFIGURATIONS down to only ones that are Lambda SAM for this run producer
        return super.getConfigurationSettingsList(runManager)
                .filter { it.configuration is SamRunConfiguration }
    }

    override fun setupConfigurationFromContext(
        configuration: SamRunConfiguration,
        context: ConfigurationContext,
        sourceElement: Ref<PsiElement>
    ): Boolean {
        val element = context.psiLocation ?: return false
        val runtimeGroup = element.language.runtimeGroup ?: return false
        if (runtimeGroup !in LambdaHandlerResolver.supportedRuntimeGroups) {
            return false
        }
        val resolver = LambdaHandlerResolver.getInstance(runtimeGroup)
        val handler = resolver.determineHandler(element) ?: return false

        val sdk = ModuleRootManager.getInstance(context.module).sdk
                ?: ProjectRootManager.getInstance(context.project).projectSdk

        val runtime = sdk?.let { RuntimeGroup.runtimeForSdk(it) }
        configuration.configure(runtime, handler)
        configuration.setGeneratedName()
        return true
    }

    override fun isConfigurationFromContext(
        configuration: SamRunConfiguration,
        context: ConfigurationContext
    ): Boolean {
        val element = context.psiLocation ?: return false
        val runtimeGroup = element.language.runtimeGroup ?: return false
        if (runtimeGroup !in LambdaHandlerResolver.supportedRuntimeGroups) {
            return false
        }
        val resolver = LambdaHandlerResolver.getInstance(runtimeGroup)
        val handler = resolver.determineHandler(element) ?: return false
        return configuration.settings.handler == handler
    }

    companion object {
        private fun getFactory(): ConfigurationFactory {
            return LambdaRunConfiguration.getInstance()
                    .configurationFactories.first { it is SamRunConfigurationFactory }
        }
    }
}