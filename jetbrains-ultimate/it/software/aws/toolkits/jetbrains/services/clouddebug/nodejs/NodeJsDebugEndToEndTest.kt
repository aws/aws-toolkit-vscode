// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.clouddebug.nodejs

import com.intellij.execution.executors.DefaultDebugExecutor
import com.intellij.openapi.application.ApplicationInfo
import com.intellij.openapi.util.registry.Registry
import com.intellij.testFramework.runInEdtAndWait
import com.intellij.xdebugger.XDebuggerUtil
import org.assertj.core.api.Assertions
import org.junit.After
import org.junit.Assume.assumeTrue
import org.junit.Before
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
import software.aws.toolkits.jetbrains.utils.WebStormTestUtils
import software.aws.toolkits.jetbrains.utils.checkBreakPointHit
import software.aws.toolkits.jetbrains.utils.executeRunConfiguration
import software.aws.toolkits.jetbrains.utils.rules.HeavyNodeJsCodeInsightTestFixtureRule

class NodeJsDebugEndToEndTest : CloudDebugTestCase("CloudDebugTestECSClusterTaskDefinitionWithNode") {
    @Rule
    @JvmField
    val projectRule = HeavyNodeJsCodeInsightTestFixtureRule()

    private var previousRegistryValue: Boolean = true
    private val WEB_CONSOLE_JB_REGISTRY_KEY = "js.debugger.webconsole"

    private val fileContents =
        """
        function abc() {
            return 'Hello World'
        }
        
        exports.lambdaHandler = async (event, context) => {
            return abc()
        };
        """.trimIndent()

    @Before
    override fun setUp() {
        assumeTrue(ApplicationInfo.getInstance().let { info -> info.majorVersion == "2019" && info.minorVersionMainPart == "2" })
        super.setUp()
        // Disable the web console. This is needed because it breaks the test when the console is created which throws
        // a terrible incomprehensible stack trace from the internals of JavaFX (because there is no screen)
        val jbWebConsoleRegistryValue = Registry.get(WEB_CONSOLE_JB_REGISTRY_KEY)
        previousRegistryValue = jbWebConsoleRegistryValue.asBoolean()
        jbWebConsoleRegistryValue.setValue(false)
    }

    @After
    override fun tearDown() {
        super.tearDown()
        // Restore the value for the web console after the test
        Registry.get(WEB_CONSOLE_JB_REGISTRY_KEY).setValue(previousRegistryValue)
    }

    @Test
    fun testEndToEnd() {
        // setup project workspace
        val testScript = addNodeFile()
        WebStormTestUtils.ensureBuiltInServerStarted()
        setUpMocks()

        // set breakpoint
        projectRule.addBreakpoint()

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
                platform = CloudDebuggingPlatform.NODE
                startCommand = "node /app.js"
                artifactMappings = listOf(ArtifactMapping(testScript, "/app.js"))
            }))
        }

        val debuggerIsHit = checkBreakPointHit(projectRule.project)
        runUnderRealCredentials(projectRule.project) {
            configuration.regionId(projectRule.project.activeRegion().id)
            configuration.credentialProviderId(projectRule.project.activeCredentialProvider().id)
            configuration.checkConfiguration()
            executeRunConfiguration(configuration, DefaultDebugExecutor.EXECUTOR_ID)
        }
        Assertions.assertThat(debuggerIsHit.get()).isTrue()
    }

    private fun addNodeFile(): String {
        val fixture = projectRule.fixture

        val psiFile = fixture.addFileToProject("hello_world/app.js", fileContents)

        runInEdtAndWait {
            fixture.openFileInEditor(psiFile.virtualFile)
        }

        return psiFile.virtualFile.path
    }

    private fun addBreakpoint(lineNumber: Int) {
        runInEdtAndWait {
            XDebuggerUtil.getInstance().toggleLineBreakpoint(
                projectRule.project,
                projectRule.fixture.file.virtualFile,
                lineNumber
            )
        }
    }

    override fun getProject() = projectRule.project
}
