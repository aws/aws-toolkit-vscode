// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.deploy

import com.intellij.execution.OutputListener
import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.process.OSProcessHandler
import com.intellij.execution.process.ProcessEvent
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.util.Key
import com.intellij.testFramework.runInEdtAndGet
import com.intellij.util.ExceptionUtil
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.cloudformation.CloudFormationClient
import software.amazon.awssdk.services.s3.S3Client
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.core.rules.S3TemporaryBucketRule
import software.aws.toolkits.jetbrains.core.credentials.runUnderRealCredentials
import software.aws.toolkits.jetbrains.utils.rules.HeavyJavaCodeInsightTestFixtureRule
import java.util.concurrent.TimeUnit

class SamDeployTest {
    private val stackName = "SamDeployTest"
    private val s3Client = S3Client.builder().region(Region.US_WEST_2).build()
    private val cfnClient = CloudFormationClient.builder().region(Region.US_WEST_2).build()

    @Rule
    @JvmField
    val projectRule = HeavyJavaCodeInsightTestFixtureRule()

    @Rule
    @JvmField
    val bucketRule = S3TemporaryBucketRule(s3Client)

    @Test
    fun deployAppUsingSam() {
        projectRule.fixture.addFileToProject(
            "hello_world/app.py",
            """
            def lambda_handler(event, context):
                return "Hello world"
            """.trimIndent()
        )

        val file = projectRule.fixture.addFileToProject(
            "template.yaml",
            """
            AWSTemplateFormatVersion: '2010-09-09'
            Transform: AWS::Serverless-2016-10-31
            Resources:
              SomeFunction:
                Type: AWS::Serverless::Function
                Properties:
                  Handler: hello_world/app.lambda_handler
                  CodeUri: .
                  Runtime: python3.6
                  Timeout: 900
            """.trimIndent()
        ).virtualFile

        val deployDialog = runInEdtAndGet {
            runUnderRealCredentials(projectRule.project) {
                object : SamDeployDialog(
                    projectRule.project,
                    stackName,
                    file,
                    AwsRegion(Region.US_WEST_2.id(), "us-west-2"),
                    bucketRule.createBucket(stackName),
                    false
                ) {
                    override fun createProcess(command: GeneralCommandLine): OSProcessHandler =
                        super.createProcess(command).also {
                            it.addProcessListener(
                                object : OutputListener() {
                                    override fun onTextAvailable(event: ProcessEvent, outputType: Key<*>) {
                                        super.onTextAvailable(event, outputType)
                                        println("SAM CLI: ${event.text}")
                                    }
                                })
                        }
                }
            }
        }

        Disposer.register(projectRule.fixture.testRootDisposable, deployDialog.disposable)

        val changeSetArn = deployDialog.executeDeployment().toCompletableFuture().get(5, TimeUnit.MINUTES)
        try {
            assertThat(changeSetArn).isNotNull()

            val describeChangeSetResponse = cfnClient.describeChangeSet {
                it.stackName(stackName)
                it.changeSetName(changeSetArn)
            }

            assertThat(describeChangeSetResponse).isNotNull
        } finally {
            try {
                cfnClient.deleteChangeSet {
                    it.changeSetName(changeSetArn)
                }
            } catch (e: Exception) {
                println("Failed to delete change set $changeSetArn: ${ExceptionUtil.getMessage(e)}")
            }
        }
    }
}
