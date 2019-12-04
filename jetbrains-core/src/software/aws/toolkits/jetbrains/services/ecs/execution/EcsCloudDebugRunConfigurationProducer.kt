// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.ecs.execution

import com.intellij.execution.actions.ConfigurationContext
import com.intellij.execution.actions.RunConfigurationProducer
import com.intellij.execution.configurations.ConfigurationFactory
import com.intellij.openapi.util.Ref
import com.intellij.psi.PsiElement
import software.aws.toolkits.jetbrains.core.credentials.activeCredentialProvider
import software.aws.toolkits.jetbrains.core.credentials.activeRegion
import software.aws.toolkits.jetbrains.services.ecs.EcsUtils

@Suppress("DEPRECATION") // LazyRunConfigurationProducer not added till 2019.1 FIX_WHEN_MIN_IS_192
class EcsCloudDebugRunConfigurationProducer : RunConfigurationProducer<EcsCloudDebugRunConfiguration>(getFactory()) {
    override fun isConfigurationFromContext(
        configuration: EcsCloudDebugRunConfiguration,
        context: ConfigurationContext
    ): Boolean {
        val location = context.location as? EcsCloudDebugLocation ?: return false
        val service = location.service
        val project = context.project

        return configuration.clusterArn() == service.clusterArn() &&
            configuration.serviceArn() == service.serviceArn() &&
            configuration.regionId() == project.activeRegion().id &&
            configuration.credentialProviderId() == project.activeCredentialProvider().id
    }

    override fun setupConfigurationFromContext(
        configuration: EcsCloudDebugRunConfiguration,
        context: ConfigurationContext,
        sourceElement: Ref<PsiElement>
    ): Boolean {
        val location = context.location as? EcsCloudDebugLocation ?: return false
        val service = location.service
        val project = context.project

        if (!EcsUtils.isInstrumented(service.serviceArn())) {
            return false
        }

        configuration.clusterArn(service.clusterArn())
        configuration.serviceArn(service.serviceArn())
        configuration.regionId(context.project.activeRegion().id)
        configuration.credentialProviderId(project.activeCredentialProvider().id)
        configuration.setGeneratedName()

        return true
    }

    companion object {
        fun getFactory(): ConfigurationFactory = EcsCloudDebugRunConfigurationType.getInstance()
    }
}
