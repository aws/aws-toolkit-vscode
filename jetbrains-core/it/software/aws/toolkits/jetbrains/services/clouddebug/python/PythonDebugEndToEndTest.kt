// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.clouddebug.python

import com.intellij.execution.configurations.RuntimeConfigurationWarning
import com.intellij.execution.executors.DefaultDebugExecutor
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
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
import software.aws.toolkits.jetbrains.utils.checkBreakPointHit
import software.aws.toolkits.jetbrains.utils.executeRunConfiguration
import software.aws.toolkits.jetbrains.utils.rules.PythonCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.rules.addBreakpoint
import java.nio.file.Path
import java.nio.file.Paths
import java.util.concurrent.CountDownLatch

// We use the corretto image for Python too, that is why we use the Java Task Def
class PythonDebugEndToEndTest : CloudDebugTestCase("CloudDebugTestECSClusterTaskDefinitionWithJava") {
    @JvmField
    @Rule
    val projectRule = PythonCodeInsightTestFixtureRule()

    @Test
    fun testEndToEnd() {
        // setup project workspace
        val testScript = addPythonFile("test.py",
            """
            import hello
            import folderNoTrailingSlash.hello
            import folderTrailingSlash.hello
            """.trimIndent())
        val file = addPythonFile("hello.py")
        projectRule.addBreakpoint()

        val folderNoTrailingSlash = addPythonFile("folderNoTrailingSlash/hello.py")
        projectRule.addBreakpoint()
        projectRule.fixture.addFileToProject("folderNoTrailingSlash/__init__.py", "")

        val folderTrailingSlash = addPythonFile("folderTrailingSlash/hello.py")
        projectRule.addBreakpoint()
        projectRule.fixture.addFileToProject("folderTrailingSlash/__init__.py", "")

        // set breakpoint
        val countDown = CountDownLatch(3)
        checkBreakPointHit(projectRule.project) {
            countDown.countDown()
        }

        setUpMocks()

        // run a run configuration
        val configuration = EcsCloudDebugRunConfiguration(
            projectRule.project,
            EcsCloudDebugRunConfigurationProducer.getFactory()
        ).apply {
            clusterArn(service.clusterArn())
            // TODO: remove this once we fix the UX around which service is debugged
            serviceArn(service.serviceArn().let {
                // replace service name with instrumented service name
                val instrumentedServiceName = "cloud-debug-${EcsUtils.serviceArnToName(service.serviceArn())}"
                it.replace(EcsUtils.serviceArnToName(it), instrumentedServiceName)
            })
            containerOptions(mapOf("ContainerName" to ContainerOptions().apply {
                platform = CloudDebuggingPlatform.PYTHON
                startCommand = "python /${testScript.fileName}"
                artifactMappings = listOf(
                    ArtifactMapping(testScript.toString(), "/test.py"),
                    ArtifactMapping(file.toString(), "/hello.py"),
                    ArtifactMapping(folderNoTrailingSlash.parent.toString().trimEnd('/'), "/"),
                    ArtifactMapping(folderTrailingSlash.parent.toString().trimEnd('/') + '/', "/folderTrailingSlash")
                )
            }))
        }

        runUnderRealCredentials(projectRule.project) {
            try {
                configuration.regionId(projectRule.project.activeRegion().id)
                configuration.credentialProviderId(projectRule.project.activeCredentialProvider().id)
                configuration.checkConfiguration()
            } catch (_: RuntimeConfigurationWarning) {
                // ignore warnings because we know what we're doing
            }
            executeRunConfiguration(configuration, DefaultDebugExecutor.EXECUTOR_ID)
        }

        // check breakpoint hit
        assertThat(countDown.count).isEqualTo(0)
    }

    private fun addPythonFile(relPath: String, contents: String? = null): Path {
        val fixture = projectRule.fixture
        val psiClass = fixture.addFileToProject(
            relPath,
            contents ?: """
            def hello_world():
                print("hello world!")

            hello_world()
            """.trimIndent()
        )

        runInEdtAndWait {
            fixture.openFileInEditor(psiClass.containingFile.virtualFile)
        }

        return Paths.get(psiClass.virtualFile.path)
    }

    override fun getProject() = projectRule.project
}
