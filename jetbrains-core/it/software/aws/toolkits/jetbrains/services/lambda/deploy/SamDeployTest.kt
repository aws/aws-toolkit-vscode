// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.deploy

import com.intellij.execution.OutputListener
import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.process.OSProcessHandler
import com.intellij.execution.process.ProcessEvent
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.util.Key
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.testFramework.runInEdtAndGet
import com.intellij.util.ExceptionUtil
import org.assertj.core.api.Assertions.assertThat
import org.junit.Ignore
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.cloudformation.CloudFormationClient
import software.amazon.awssdk.services.cloudformation.model.Parameter
import software.amazon.awssdk.services.s3.S3Client
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.core.rules.S3TemporaryBucketRule
import software.aws.toolkits.jetbrains.core.credentials.MockProjectAccountSettingsManager
import software.aws.toolkits.jetbrains.core.credentials.runUnderRealCredentials
import software.aws.toolkits.jetbrains.utils.rules.HeavyJavaCodeInsightTestFixtureRule
import java.util.concurrent.TimeUnit

@Ignore // Ignored due to using SAM build which isn't on CI/CD box
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

    @Before
    fun setUp() {
        MockProjectAccountSettingsManager.getInstance(projectRule.project).activeRegion = AwsRegion(Region.US_WEST_2.id(), "us-west-2")
    }

    @Test
    fun deployAppUsingSam() {
        val templateFile = setUpProject()
        val changeSetArn = createChangeSet(templateFile)

        assertThat(changeSetArn).isNotNull()
        runAssertsAndClean(changeSetArn!!) {
            val describeChangeSetResponse = cfnClient.describeChangeSet {
                it.stackName(stackName)
                it.changeSetName(changeSetArn)
            }

            assertThat(describeChangeSetResponse).isNotNull
            assertThat(describeChangeSetResponse.parameters()).contains(Parameter.builder()
                .parameterKey("TestParameter")
                .parameterValue("HelloWorld")
                .build())
        }
    }

    @Test
    fun deployAppUsingSamWithParameters() {
        val templateFile = setUpProject()
        val changeSetArn = createChangeSet(templateFile, mapOf("TestParameter" to "FooBar"))

        assertThat(changeSetArn).isNotNull()
        runAssertsAndClean(changeSetArn!!) {
            val describeChangeSetResponse = cfnClient.describeChangeSet {
                it.stackName(stackName)
                it.changeSetName(changeSetArn)
            }

            assertThat(describeChangeSetResponse).isNotNull
            assertThat(describeChangeSetResponse.parameters()).contains(Parameter.builder()
                .parameterKey("TestParameter")
                .parameterValue("FooBar")
                .build())
        }
    }

    private fun setUpProject(): VirtualFile {
        projectRule.fixture.addFileToProject(
            "hello_world/app.py",
            """
                def lambda_handler(event, context):
                    return "Hello world"
                """.trimIndent()
        )

        return projectRule.fixture.addFileToProject(
            "template.yaml",
            """
                AWSTemplateFormatVersion: '2010-09-09'
                Transform: AWS::Serverless-2016-10-31
                Parameters:
                  TestParameter:
                    Type: String
                    Default: HelloWorld
                    AllowedValues:
                      - HelloWorld
                      - FooBar
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
    }

    private fun createChangeSet(templateFile: VirtualFile, parameters: Map<String, String> = emptyMap()): String? {
        val deployDialog = runInEdtAndGet {
            runUnderRealCredentials(projectRule.project) {
                object : SamDeployDialog(
                    projectRule.project,
                    stackName,
                    templateFile,
                    parameters,
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
                }.also {
                    Disposer.register(projectRule.fixture.testRootDisposable, it.disposable)
                }
            }
        }

        return deployDialog.executeDeployment().toCompletableFuture().get(5, TimeUnit.MINUTES)
    }

    private fun runAssertsAndClean(changeSetArn: String, asserts: () -> Unit) {
        try {
            asserts.invoke()
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
