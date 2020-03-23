// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.clouddebug

import base.AwsReuseSolutionTestBase
import com.jetbrains.rdclient.util.idea.pumpMessages
import com.jetbrains.rider.projectView.solutionDirectory
import com.jetbrains.rider.test.asserts.shouldBeTrue
import com.jetbrains.rider.test.scriptingApi.buildSolutionWithReSharperBuild
import org.assertj.core.api.Assertions
import org.testng.annotations.DataProvider
import org.testng.annotations.Test
import software.aws.toolkits.jetbrains.services.ecs.execution.ArtifactMapping
import java.time.Duration

class DotNetStartupCommandTest : AwsReuseSolutionTestBase() {

    override fun getSolutionDirectoryName() = "SamHelloWorldApp"

    private val startCommand = DotNetStartupCommand()

    @DataProvider(name = "artifactsMappingTestData")
    fun artifactsMappingTestData() = arrayOf(
        arrayOf("EmptyArtifactsMap", "original command", ArtifactMapping()),
        arrayOf("ArtifactsMapWithLocalPathOnly", "original command", ArtifactMapping(localPath = "/tmp/local/path")),
        arrayOf("ArtifactsMapWithRemotePathOnly", "original command", ArtifactMapping(remotePath = "/tmp/remote/path")),
        arrayOf("AssemblyDoesNotExist", "original command", ArtifactMapping(localPath = "/tmp/local/path", remotePath = "/tmp/remote/path"))
    )

    @Test(dataProvider = "artifactsMappingTestData")
    fun testUpdateStartupCommand_ReturnOriginalCommand(name: String, originalCommand: String, artifactsMap: ArtifactMapping) {
        var command = ""
        startCommand.updateStartupCommand(
            project = project,
            originalCommand = originalCommand,
            artifact = artifactsMap,
            onCommandGet = { command = it }
        )

        pumpMessages(Duration.ofSeconds(2).toMillis()) { command.isNotEmpty() }
        Assertions.assertThat(command).isEqualTo(originalCommand)
    }

    @Test
    fun testUpdateCommand_AssemblyFound_UpdateStartupCommand() {
        buildSolutionWithReSharperBuild(project)
        val assemblyPath = project.solutionDirectory
            .resolve("src")
            .resolve("HelloWorld")
            .resolve("bin")
            .resolve("Debug")
            .resolve("netcoreapp2.1")
            .resolve("HelloWorld.dll")

        assemblyPath.exists().shouldBeTrue("Failed to find assembly file by path: '${assemblyPath.canonicalPath}'")

        val originalCommand = "original command"
        var command = ""
        startCommand.updateStartupCommand(
            project = project,
            originalCommand = originalCommand,
            artifact = ArtifactMapping(
                localPath = assemblyPath.canonicalPath,
                remotePath = "/tmp/remote/path"
            ),
            onCommandGet = { command = it }
        )
        pumpMessages(Duration.ofSeconds(2).toMillis()) { command.isNotEmpty() }

        val expectedCommand = "dotnet /tmp/remote/path/netcoreapp2.1/HelloWorld.dll"
        Assertions.assertThat(command).isEqualTo(expectedCommand)
    }
}
