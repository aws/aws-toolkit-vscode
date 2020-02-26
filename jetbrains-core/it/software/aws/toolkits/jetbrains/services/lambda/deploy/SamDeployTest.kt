// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.deploy

import com.intellij.openapi.util.Disposer
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.testFramework.runInEdtAndGet
import com.intellij.util.ExceptionUtil
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.http.apache.ApacheHttpClient
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.cloudformation.CloudFormationClient
import software.amazon.awssdk.services.cloudformation.model.Parameter
import software.amazon.awssdk.services.s3.S3Client
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.core.rules.S3TemporaryBucketRule
import software.aws.toolkits.jetbrains.core.credentials.MockProjectAccountSettingsManager
import software.aws.toolkits.jetbrains.core.credentials.runUnderRealCredentials
import software.aws.toolkits.jetbrains.utils.rules.HeavyJavaCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.setSamExecutableFromEnvironment
import java.util.UUID
import java.util.concurrent.TimeUnit

class SamDeployTest {
    private val s3Client = S3Client.builder()
        .httpClient(ApacheHttpClient.builder().build())
        .region(Region.US_WEST_2)
        .serviceConfiguration { it.pathStyleAccessEnabled(true) }
        .build()

    private val cfnClient = CloudFormationClient.builder()
        .httpClient(ApacheHttpClient.builder().build())
        .region(Region.US_WEST_2)
        .build()

    @Rule
    @JvmField
    val projectRule = HeavyJavaCodeInsightTestFixtureRule()

    @Rule
    @JvmField
    val bucketRule = S3TemporaryBucketRule(s3Client)

    @Before
    fun setUp() {
        setSamExecutableFromEnvironment()

        MockProjectAccountSettingsManager.getInstance(projectRule.project).changeRegion(AwsRegion(Region.US_WEST_2.id(), "us-west-2", "aws"))
    }

    @Test
    fun deployAppUsingSam() {
        val stackName = "SamDeployTest-${UUID.randomUUID()}"
        val templateFile = setUpProject()
        runAssertsAndClean(stackName) {
            val changeSetArn = createChangeSet(templateFile, stackName)

            assertThat(changeSetArn).isNotNull()

            val describeChangeSetResponse = cfnClient.describeChangeSet {
                it.stackName(stackName)
                it.changeSetName(changeSetArn)
            }

            assertThat(describeChangeSetResponse).isNotNull
            assertThat(describeChangeSetResponse.parameters()).contains(
                Parameter.builder()
                    .parameterKey("TestParameter")
                    .parameterValue("HelloWorld")
                    .build()
            )
        }
    }

    @Test
    fun deployAppUsingSamWithParameters() {
        val stackName = "SamDeployTest-${UUID.randomUUID()}"
        val templateFile = setUpProject()
        runAssertsAndClean(stackName) {
            val changeSetArn = createChangeSet(templateFile, stackName, mapOf("TestParameter" to "FooBar"))

            assertThat(changeSetArn).isNotNull()

            val describeChangeSetResponse = cfnClient.describeChangeSet {
                it.stackName(stackName)
                it.changeSetName(changeSetArn)
            }

            assertThat(describeChangeSetResponse).isNotNull
            assertThat(describeChangeSetResponse.parameters()).contains(
                Parameter.builder()
                    .parameterKey("TestParameter")
                    .parameterValue("FooBar")
                    .build()
            )
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

        projectRule.fixture.addFileToProject(
            "requirements.txt",
            ""
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
                      Runtime: python2.7
                      Timeout: 900
                """.trimIndent()
        ).virtualFile
    }

    private fun createChangeSet(templateFile: VirtualFile, stackName: String, parameters: Map<String, String> = emptyMap()): String? {
        val deployDialog = runInEdtAndGet {
            runUnderRealCredentials(projectRule.project) {
                SamDeployDialog(
                    projectRule.project,
                    stackName,
                    templateFile,
                    parameters,
                    bucketRule.createBucket(stackName),
                    false,
                    true
                ).also {
                    Disposer.register(projectRule.fixture.testRootDisposable, it.disposable)
                }
            }
        }

        return deployDialog.deployFuture.get(5, TimeUnit.MINUTES)
    }

    private fun runAssertsAndClean(stackName: String, asserts: () -> Unit) {
        try {
            asserts.invoke()
        } finally {
            try {
                cfnClient.deleteStack {
                    it.stackName(stackName)
                }
            } catch (e: Exception) {
                println("Failed to delete stack $stackName: ${ExceptionUtil.getMessage(e)}")
            }
        }
    }
}
