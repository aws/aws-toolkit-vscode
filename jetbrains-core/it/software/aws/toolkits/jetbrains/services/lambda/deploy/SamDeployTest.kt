// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.deploy

import com.intellij.openapi.vfs.VirtualFile
import com.intellij.testFramework.runInEdtAndGet
import com.intellij.util.ExceptionUtil
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.cloudformation.CloudFormationClient
import software.amazon.awssdk.services.cloudformation.model.Parameter
import software.amazon.awssdk.services.ecr.EcrClient
import software.amazon.awssdk.services.s3.S3Client
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.core.rules.EcrTemporaryRepositoryRule
import software.aws.toolkits.core.rules.S3TemporaryBucketRule
import software.aws.toolkits.jetbrains.core.credentials.MockAwsConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.runUnderRealCredentials
import software.aws.toolkits.jetbrains.services.lambda.upload.steps.DeployLambda
import software.aws.toolkits.jetbrains.services.lambda.upload.steps.createDeployWorkflow
import software.aws.toolkits.jetbrains.utils.assumeImageSupport
import software.aws.toolkits.jetbrains.utils.execution.steps.StepExecutor
import software.aws.toolkits.jetbrains.utils.readProject
import software.aws.toolkits.jetbrains.utils.rules.HeavyJavaCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.rules.addModule
import software.aws.toolkits.jetbrains.utils.setSamExecutableFromEnvironment
import software.aws.toolkits.resources.message
import java.io.File
import java.nio.file.Paths
import java.util.UUID
import java.util.concurrent.TimeUnit

class SamDeployTest {
    private val s3Client = S3Client.builder()
        .region(Region.US_WEST_2)
        .serviceConfiguration { it.pathStyleAccessEnabled(true) }
        .build()

    private val cfnClient = CloudFormationClient.builder()
        .region(Region.US_WEST_2)
        .build()

    private val ecrClient = EcrClient.builder()
        .region(Region.US_WEST_2)
        .build()

    private val largeTemplateLocation = Paths.get(System.getProperty("testDataPath"), "testFiles", "LargeTemplate.yml").toString()

    @Rule
    @JvmField
    val projectRule = HeavyJavaCodeInsightTestFixtureRule()

    @Rule
    @JvmField
    val bucketRule = S3TemporaryBucketRule(s3Client)

    @Rule
    @JvmField
    val repositoryRule = EcrTemporaryRepositoryRule(ecrClient)

    @Before
    fun setUp() {
        setSamExecutableFromEnvironment()

        MockAwsConnectionManager.getInstance(projectRule.project).changeRegion(AwsRegion(Region.US_WEST_2.id(), "us-west-2", "aws"))

        // we need at least one module for deploy image (for read project)
        projectRule.fixture.addModule("main")
    }

    @Test
    fun deployAppUsingSam() {
        val stackName = "SamDeployTest-${UUID.randomUUID()}"
        val templateFile = setUpProject()
        runAssertsAndClean(stackName) {
            val changeSetArn = createChangeSet(templateFile, stackName, hasImage = false)

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
    // Tests using a stack > the CFN limit of 51200 bytes
    fun deployLargeAppUsingSam() {
        val stackName = "SamDeployTest-${UUID.randomUUID()}"
        val templateFile = setUpProject(largeTemplateLocation)
        runAssertsAndClean(stackName) {
            val changeSetArn = createChangeSet(templateFile, stackName, mapOf("InstanceType" to "t2.small"), false)

            assertThat(changeSetArn).isNotNull()

            val describeChangeSetResponse = cfnClient.describeChangeSet {
                it.stackName(stackName)
                it.changeSetName(changeSetArn)
            }

            assertThat(describeChangeSetResponse).isNotNull
            assertThat(describeChangeSetResponse.parameters()).contains(
                Parameter.builder()
                    .parameterKey("InstanceType")
                    .parameterValue("t2.small")
                    .build()
            )
        }
    }

    @Test
    fun deployAppUsingSamWithParameters() {
        val stackName = "SamDeployTest-${UUID.randomUUID()}"
        val templateFile = setUpProject()
        runAssertsAndClean(stackName) {
            val changeSetArn = createChangeSet(templateFile, stackName, mapOf("TestParameter" to "FooBar"), false)

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

    @Test
    fun deployImageBasedSamApp() {
        assumeImageSupport()
        val stackName = "SamDeployTest-${UUID.randomUUID()}"
        val (_, templateFile) = readProject(
            projectRule = projectRule,
            relativePath = "samProjects/image/java11/maven",
            sourceFileName = "App.java"
        )
        runAssertsAndClean(stackName) {
            val changeSetArn = createChangeSet(templateFile, stackName, hasImage = true)

            assertThat(changeSetArn).isNotNull()

            val describeChangeSetResponse = cfnClient.describeChangeSet {
                it.stackName(stackName)
                it.changeSetName(changeSetArn)
            }

            assertThat(describeChangeSetResponse).isNotNull
            assertThat(describeChangeSetResponse.parameters()).isEmpty()
        }
    }

    private fun setUpProject(templateFilePath: String? = null): VirtualFile {
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

        return if (templateFilePath == null) {
            projectRule.fixture.addFileToProject(
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
        } else {
            projectRule.fixture.addFileToProject("template.yaml", File(templateFilePath).readText()).virtualFile
        }
    }

    private fun createChangeSet(templateFile: VirtualFile, stackName: String, parameters: Map<String, String> = emptyMap(), hasImage: Boolean): String? =
        runUnderRealCredentials(projectRule.project) {
            var changeSetArn: String? = null
            val deployDialog = runInEdtAndGet {
                val workflow = StepExecutor(
                    projectRule.project,
                    message("serverless.application.deploy_in_progress.title", stackName),
                    createDeployWorkflow(
                        projectRule.project,
                        stackName,
                        templateFile,
                        bucketRule.createBucket(stackName),
                        if (hasImage) repositoryRule.createRepository(stackName).repositoryUri() else null,
                        true,
                        parameters,
                        CreateCapabilities.values().toList()
                    ),
                    stackName
                )

                workflow.onSuccess = {
                    changeSetArn = it.getRequiredAttribute(DeployLambda.CHANGE_SET_ARN)
                }

                workflow.startExecution()
            }

            deployDialog.waitFor(TimeUnit.MINUTES.toMillis(5))

            changeSetArn
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
