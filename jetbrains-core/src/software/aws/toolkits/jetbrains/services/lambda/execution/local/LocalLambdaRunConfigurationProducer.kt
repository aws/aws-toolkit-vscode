// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.local

import com.intellij.execution.RunManager
import com.intellij.execution.RunnerAndConfigurationSettings
import com.intellij.execution.actions.ConfigurationContext
import com.intellij.execution.actions.RunConfigurationProducer
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Ref
import com.intellij.psi.PsiElement
import org.jetbrains.yaml.psi.YAMLKeyValue
import org.jetbrains.yaml.psi.YAMLPsiElement
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.jetbrains.core.credentials.ProjectAccountSettingsManager
import software.aws.toolkits.jetbrains.services.lambda.LambdaHandlerResolver
import software.aws.toolkits.jetbrains.services.lambda.RuntimeGroup
import software.aws.toolkits.jetbrains.services.lambda.execution.LambdaRunConfigurationType
import software.aws.toolkits.jetbrains.services.lambda.runtimeGroup
import software.aws.toolkits.jetbrains.services.lambda.sam.SamTemplateUtils.functionFromElement

@Suppress("DEPRECATION") // LazyRunConfigurationProducer not added till 2019.1 FIX_WHEN_MIN_IS_192
class LocalLambdaRunConfigurationProducer : RunConfigurationProducer<LocalLambdaRunConfiguration>(getFactory()) {
    // Filter all Lambda run CONFIGURATIONS down to only ones that are Lambda SAM for this run producer
    override fun getConfigurationSettingsList(runManager: RunManager): List<RunnerAndConfigurationSettings> =
        super.getConfigurationSettingsList(runManager).filter { it.configuration is LocalLambdaRunConfiguration }

    override fun setupConfigurationFromContext(
        configuration: LocalLambdaRunConfiguration,
        context: ConfigurationContext,
        sourceElement: Ref<PsiElement>
    ): Boolean {
        val element = context.psiLocation ?: return false
        val result = when (val parent = element.parent) {
            is YAMLKeyValue -> setupFromTemplate(parent, configuration)
            else -> setupFromSourceFile(element, context, configuration)
        }
        if (result) {
            configuration.setGeneratedName()
        }
        return result
    }

    override fun isConfigurationFromContext(configuration: LocalLambdaRunConfiguration, context: ConfigurationContext): Boolean {
        val element = context.psiLocation ?: return false
        return when (val parent = element.parent) {
            is YAMLPsiElement -> isFromTemplateContext(parent, configuration)
            else -> isFromSourceFileContext(element, configuration)
        }
    }

    private fun setupFromSourceFile(element: PsiElement, context: ConfigurationContext, configuration: LocalLambdaRunConfiguration): Boolean {
        val runtimeGroup = element.language.runtimeGroup ?: return false
        if (runtimeGroup !in LambdaHandlerResolver.supportedRuntimeGroups) {
            return false
        }
        val resolver = LambdaHandlerResolver.getInstanceOrThrow(runtimeGroup)
        val handler = resolver.determineHandler(element) ?: return false
        val runtime = RuntimeGroup.determineRuntime(context.module) ?: RuntimeGroup.determineRuntime(context.project)

        setAccountOptions(configuration)
        configuration.useHandler(runtime, handler)

        return true
    }

    private fun setupFromTemplate(element: YAMLPsiElement, configuration: LocalLambdaRunConfiguration): Boolean {
        val file = element.containingFile?.virtualFile?.path ?: return false
        val function = functionFromElement(element) ?: return false
        setAccountOptions(configuration)
        configuration.useTemplate(file, function.logicalName)

        return true
    }

    private fun isFromSourceFileContext(element: PsiElement, configuration: LocalLambdaRunConfiguration): Boolean {
        val runtimeGroup = element.language.runtimeGroup ?: return false
        if (runtimeGroup !in LambdaHandlerResolver.supportedRuntimeGroups) {
            return false
        }
        val resolver = LambdaHandlerResolver.getInstanceOrThrow(runtimeGroup)
        val handler = resolver.determineHandler(element) ?: return false
        return configuration.handler() == handler
    }

    private fun isFromTemplateContext(element: YAMLPsiElement, configuration: LocalLambdaRunConfiguration): Boolean {
        val templateFile = configuration.templateFile() ?: return false
        val functionName = configuration.logicalId() ?: return false
        val file = element.containingFile?.virtualFile?.path ?: return false
        val function = functionFromElement(element) ?: return false
        return templateFile == file && functionName == function.logicalName
    }

    companion object {
        fun getFactory() = LambdaRunConfigurationType.getInstance().configurationFactories.first { it is LocalLambdaRunConfigurationFactory }

        fun setAccountOptions(configuration: LocalLambdaRunConfiguration) {
            val project = configuration.project
            val settings = accountSettings(project)

            configuration.credentialProviderId(settings.first)
            configuration.regionId(settings.second?.id)
        }

        private fun accountSettings(project: Project): Pair<String?, AwsRegion?> {
            val settingsManager = ProjectAccountSettingsManager.getInstance(project)
            val region = try {
                settingsManager.activeRegion
            } catch (_: Exception) {
                null
            }

            val credentialProviderId = try {
                settingsManager.activeCredentialProvider.id
            } catch (_: Exception) {
                null
            }

            return credentialProviderId to region
        }
    }
}
