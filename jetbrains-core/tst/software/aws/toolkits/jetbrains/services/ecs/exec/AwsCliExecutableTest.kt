// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.ecs.exec

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.testFramework.ProjectRule
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test

class AwsCliExecutableTest {
    @Rule
    @JvmField
    val projectRule = ProjectRule()

    private val clusterArn = "arn:aws:ecs:us-east-1:123456789012:cluster/cluster-name"
    private val taskArn = "arn:aws:ecs:us-east-1:123456789012:task/task-name"

    @Test
    fun `Execute Command is returned correctly along with its Environment Variables`() {
        val envVariables = mapOf("region" to "sample-region", "credentials" to "sample-credentials")
        val executeCommand = GeneralCommandLine("aws").execCommand(
            environmentVariables = envVariables,
            clusterArn = clusterArn,
            task = taskArn,
            shell = "/bin/bash",
            containerName = "sample-container"
        )
        assertThat(executeCommand.environment).containsEntry("region", "sample-region")
        assertThat(executeCommand.environment).containsEntry("credentials", "sample-credentials")
        assertThat(executeCommand.commandLineString).isEqualTo(
            "aws ecs execute-command --cluster $clusterArn --task $taskArn --command /bin/bash --interactive --container sample-container"
        )
    }
}
