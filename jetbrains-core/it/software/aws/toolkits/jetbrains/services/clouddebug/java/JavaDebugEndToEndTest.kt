// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.clouddebug.java

import com.intellij.execution.BeforeRunTask
import com.intellij.execution.executors.DefaultDebugExecutor
import com.intellij.execution.executors.DefaultRunExecutor
import com.intellij.openapi.externalSystem.model.execution.ExternalSystemTaskExecutionSettings
import com.intellij.openapi.externalSystem.service.execution.ProgressExecutionMode
import com.intellij.openapi.externalSystem.task.TaskCallback
import com.intellij.openapi.externalSystem.util.ExternalSystemUtil
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.jetbrains.plugins.gradle.util.GradleConstants
import org.junit.Rule
import org.junit.Test
import org.mockito.Mockito
import software.aws.toolkits.jetbrains.core.credentials.activeCredentialProvider
import software.aws.toolkits.jetbrains.core.credentials.activeRegion
import software.aws.toolkits.jetbrains.core.credentials.runUnderRealCredentials
import software.aws.toolkits.jetbrains.services.clouddebug.CloudDebugTestCase
import software.aws.toolkits.jetbrains.services.clouddebug.CloudDebuggingPlatform
import software.aws.toolkits.jetbrains.services.ecs.EcsUtils
import software.aws.toolkits.jetbrains.services.ecs.execution.ArtifactMapping
import software.aws.toolkits.jetbrains.services.ecs.execution.ContainerOptions
import software.aws.toolkits.jetbrains.services.ecs.execution.EcsCloudDebugRunConfiguration
import software.aws.toolkits.jetbrains.services.ecs.execution.EcsCloudDebugRunConfigurationProducer
import software.aws.toolkits.jetbrains.utils.addBreakpoint
import software.aws.toolkits.jetbrains.utils.checkBreakPointHit
import software.aws.toolkits.jetbrains.utils.executeRunConfiguration
import software.aws.toolkits.jetbrains.utils.rules.HeavyJavaCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.rules.addClass
import software.aws.toolkits.jetbrains.utils.rules.addModule
import software.aws.toolkits.jetbrains.utils.setUpGradleProject
import java.nio.file.Paths
import java.util.concurrent.CompletableFuture

class JavaDebugEndToEndTest : CloudDebugTestCase("CloudDebugTestECSClusterTaskDefinitionWithJava") {
    @JvmField
    @Rule
    val projectRule = HeavyJavaCodeInsightTestFixtureRule()

    @Test
    fun testEndToEnd() {
        // setup project workspace
        addJavaFile()
        val basePath = Paths.get(projectRule.module.moduleFilePath).parent
        val jarFile = basePath.resolve(Paths.get("build", "libs", "main.jar"))

        // TODO: figure out how to turn this into a before task
        // ./gradlew jar
        val buildSettings = ExternalSystemTaskExecutionSettings().apply {
            externalSystemIdString = "GRADLE"
            externalProjectPath = basePath.toString()
            taskNames = listOf("jar")
        }

        val future = CompletableFuture<Nothing>()
        ExternalSystemUtil.runTask(buildSettings, DefaultRunExecutor.EXECUTOR_ID, projectRule.project, GradleConstants.SYSTEM_ID,
            object : TaskCallback {
                override fun onSuccess() {
                    future.complete(null)
                }

                override fun onFailure() {
                    future.completeExceptionally(RuntimeException("Jar task failed"))
                }
            }, ProgressExecutionMode.IN_BACKGROUND_ASYNC, false)
        future.join()

        // set breakpoint
        projectRule.addBreakpoint()
        val debuggerIsHit = checkBreakPointHit(projectRule.project)

        setUpMocks()

        // run a run configuration
        val configuration = EcsCloudDebugRunConfiguration(
            projectRule.project,
            EcsCloudDebugRunConfigurationProducer.getFactory()
        ).apply {
            beforeRunTasks = mutableListOf(Mockito.mock(BeforeRunTask::class.java))
            clusterArn(service.clusterArn())
            // TODO: remove this once we fix the UX around which service is debugged
            serviceArn(service.serviceArn().let {
                // replace service name with instrumented service name
                val instrumentedServiceName = "cloud-debug-${EcsUtils.serviceArnToName(service.serviceArn())}"
                it.replace(EcsUtils.serviceArnToName(it), instrumentedServiceName)
            })
            containerOptions(mapOf("ContainerName" to ContainerOptions().apply {
                platform = CloudDebuggingPlatform.JVM
                startCommand = "java -cp /main.jar Main"
                artifactMappings = listOf(ArtifactMapping(jarFile.toString(), "/main.jar"))
            }))
        }

        runUnderRealCredentials(projectRule.project) {
            configuration.regionId(projectRule.project.activeRegion().id)
            configuration.credentialProviderId(projectRule.project.activeCredentialProvider().id)
            configuration.checkConfiguration()
            executeRunConfiguration(configuration, DefaultDebugExecutor.EXECUTOR_ID)
        }

        // check breakpoint hit
        assertThat(debuggerIsHit.get()).isTrue()
    }

    private fun addJavaFile() {
        val fixture = projectRule.fixture
        val module = fixture.addModule("main")
        val psiClass = fixture.addClass(
            module,
            """
            public class Main {
                public static void main(String[] args) {
                    System.out.println("Hello World!");
                }
            }
            """
        )

        runInEdtAndWait {
            fixture.openFileInEditor(psiClass.containingFile.virtualFile)
        }

        projectRule.setUpGradleProject()
    }

    override fun getProject() = projectRule.project
}
