// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.ecs.exec

import com.intellij.execution.executors.DefaultRunExecutor
import com.intellij.execution.process.ProcessAdapter
import com.intellij.execution.process.ProcessEvent
import com.intellij.execution.runners.ExecutionEnvironmentBuilder
import com.intellij.openapi.util.Key
import com.intellij.openapi.util.SystemInfo
import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import software.amazon.awssdk.services.ecs.model.ContainerDefinition
import software.amazon.awssdk.services.ecs.model.Service
import software.amazon.awssdk.services.ecs.model.Task
import software.aws.toolkits.core.region.anAwsRegion
import software.aws.toolkits.jetbrains.core.MockResourceCacheRule
import software.aws.toolkits.jetbrains.core.credentials.ConnectionSettings
import software.aws.toolkits.jetbrains.core.credentials.MockAwsConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.MockCredentialManagerRule
import software.aws.toolkits.jetbrains.core.credentials.toEnvironmentVariables
import software.aws.toolkits.jetbrains.services.ecs.ContainerDetails
import software.aws.toolkits.jetbrains.services.ecs.resources.EcsResources
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.attribute.PosixFilePermissions
import java.util.concurrent.CompletableFuture
import java.util.concurrent.CountDownLatch

class RunCommandDialogTest {
    @Rule
    @JvmField
    val resourceCache = MockResourceCacheRule()

    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @Rule
    @JvmField
    val tempFolder = TemporaryFolder()

    @Rule
    @JvmField
    val credentialManager = MockCredentialManagerRule()

    @Rule
    @JvmField
    val accountSettings = MockAwsConnectionManager.ProjectAccountSettingsManagerRule(projectRule)

    private val clusterArn = "arn:aws:ecs:us-east-1:123456789012:cluster/cluster-name"
    private val serviceArn = "arn:aws:ecs:us-east-1:123456789012:service/service-name"
    private val taskArn = "arn:aws:ecs:us-east-1:123456789012:task/task-name"
    private val ecsService = Service.builder().serviceArn(serviceArn).clusterArn(clusterArn).build()

    private val containerDefinition = ContainerDefinition.builder().name("sample-container").build()
    private val container = ContainerDetails(ecsService, containerDefinition)
    lateinit var connectionSettings: ConnectionSettings
    private val command = "ls"
    private val task = Task.builder().clusterArn(clusterArn).taskArn(taskArn).build()
    private val taskList = listOf(task.taskArn())
    private val containerName = containerDefinition.name()
    private val verifyCommand = "ecs execute-command --cluster $clusterArn --task $taskArn --command $command --interactive --container $containerName"
    private val dummyRegion = anAwsRegion()

    @Before
    fun setup() {
        val credentials = credentialManager.addCredentials()
        accountSettings.settingsManager.changeCredentialProviderAndWait(credentials)
        accountSettings.settingsManager.changeRegionAndWait(dummyRegion)
        connectionSettings = accountSettings.settingsManager.connectionSettings() ?: throw Exception("No credentials found")
    }

    @Test
    fun `Correctly formed string of parameters to execute command is returned`() {
        resourceCache.addEntry(
            projectRule.project, EcsResources.listTasks(clusterArn, serviceArn),
            CompletableFuture.completedFuture(taskList)
        )
        runInEdtAndWait {
            val execCommandParameters = RunCommandDialog(projectRule.project, container, connectionSettings).constructExecCommandParameters(command)
            assertThat(execCommandParameters).isEqualTo(verifyCommand)
        }
    }

    @Test
    fun `Credentials are attached as environment variables when running AWS CLI`() {
        resourceCache.addEntry(
            projectRule.project, EcsResources.listTasks(clusterArn, serviceArn),
            CompletableFuture.completedFuture(taskList)
        )
        val programPath = makeSampleCliExecutable()
        runInEdtAndWait {
            val counter = CountDownLatch(5)
            val environmentVariables = mutableListOf<String>()
            val environment =
                ExecutionEnvironmentBuilder
                    .create(
                        projectRule.project,
                        DefaultRunExecutor.getRunExecutorInstance(),
                        RunCommandRunProfile(
                            connectionSettings?.toEnvironmentVariables(),
                            RunCommandDialog(projectRule.project, container, connectionSettings)
                                .constructExecCommandParameters(command),
                            containerName, programPath.toAbsolutePath().toString()
                        )
                    )
                    .build {
                        it.processHandler?.addProcessListener(object : ProcessAdapter() {
                            override fun onTextAvailable(event: ProcessEvent, outputType: Key<*>) {
                                super.onTextAvailable(event, outputType)
                                environmentVariables.add(event.text.replace("\n", ""))
                                counter.countDown()
                            }
                        })
                    }
            environment.runner.execute(environment)
            counter.await()
            assertThat(environmentVariables[1]).isEqualTo("Access")
            assertThat(environmentVariables[2]).isEqualTo("Secret")
            assertThat(environmentVariables[3]).isEqualTo(dummyRegion.id)
            assertThat(environmentVariables[4]).isEqualTo(dummyRegion.id)
        }
    }

    private fun makeSampleCliExecutable(): Path {
        val accessKeyId = "%AWS_ACCESS_KEY_ID%"
        val secretAccessKey = "%AWS_SECRET_ACCESS_KEY%"
        val defaultRegion = "%AWS_DEFAULT_REGION%"
        val region = "%AWS_REGION%"
        val exitCode = 0
        val execPath = Files.createTempFile(
            "awCli",
            if (SystemInfo.isWindows) ".bat" else ".sh"
        )

        val contents =
            if (SystemInfo.isWindows) {
                """
            @echo OFF
            echo $accessKeyId
            echo $secretAccessKey
            echo $defaultRegion
            echo $region
            exit $exitCode
                """.trimIndent()
            } else {
                """    
            printenv AWS_ACCESS_KEY_ID
            printenv AWS_SECRET_ACCESS_KEY
            printenv AWS_DEFAULT_REGION
            printenv AWS_REGION
            exit $exitCode
                """.trimIndent()
            }

        Files.write(execPath, contents.toByteArray())

        if (SystemInfo.isUnix) {
            Files.setPosixFilePermissions(
                execPath,
                PosixFilePermissions.fromString("r-xr-xr-x")
            )
        }

        return execPath
    }
}
