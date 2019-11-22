// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.ecs.execution

import com.intellij.execution.Location
import com.intellij.execution.actions.ConfigurationContext
import com.intellij.execution.actions.ConfigurationFromContext
import com.intellij.execution.actions.RunConfigurationProducer
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.testFramework.MapDataContext
import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.ecs.model.Service
import software.aws.toolkits.jetbrains.core.MockResourceCache

class EcsCloudDebugRunConfigurationProducerTest {
    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @Before
    fun setUp() {
        resourceCache().clear()
    }

    @Test
    fun validRunConfigurationIsCreated() {
        val clusterArn = "arn:aws:ecs:us-east-1:123456789012:cluster/cluster-name"
        val serviceArn = "arn:aws:ecs:us-east-1:123456789012:service/cloud-debug-service-name"
        val ecsService = Service.builder()
            .clusterArn(clusterArn)
            .serviceArn(serviceArn)
            .build()

        runInEdtAndWait {
            val runConfiguration = createRunConfiguration(ecsService)
            assertThat(runConfiguration).isNotNull
            val configuration = runConfiguration?.configuration as EcsCloudDebugRunConfiguration
            assertThat(configuration.clusterArn()).isEqualTo(clusterArn)
            assertThat(configuration.serviceArn()).isEqualTo(serviceArn)
            assertThat(configuration.name).isEqualTo("[cluster-name] cloud-debug-service-name (beta)")
        }
    }

    private fun createRunConfiguration(service: Service): ConfigurationFromContext? {
        val dataContext = MapDataContext()
        val context = createContext(service, dataContext)
        val producer = RunConfigurationProducer.getInstance(EcsCloudDebugRunConfigurationProducer::class.java)
        return producer.createConfigurationFromContext(context)
    }

    private fun createContext(service: Service, dataContext: MapDataContext): ConfigurationContext {
        dataContext.put(CommonDataKeys.PROJECT, projectRule.project)
        dataContext.put(Location.DATA_KEY, EcsCloudDebugLocation(projectRule.project, service))
        return ConfigurationContext.getFromContext(dataContext)
    }

    private fun resourceCache() = MockResourceCache.getInstance(projectRule.project)
}
