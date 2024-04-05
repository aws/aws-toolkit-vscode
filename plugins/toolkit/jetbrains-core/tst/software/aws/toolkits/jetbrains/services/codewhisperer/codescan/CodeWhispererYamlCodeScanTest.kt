// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.codescan

import com.intellij.openapi.vfs.VirtualFile
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.spy
import org.mockito.kotlin.stub
import software.aws.toolkits.jetbrains.services.codewhisperer.codescan.sessionconfig.CloudFormationYamlCodeScanSessionConfig
import software.aws.toolkits.jetbrains.services.codewhisperer.codescan.sessionconfig.CodeScanSessionConfig
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants
import software.aws.toolkits.jetbrains.utils.rules.PythonCodeInsightTestFixtureRule
import software.aws.toolkits.telemetry.CodewhispererLanguage
import java.io.BufferedInputStream
import java.util.zip.ZipInputStream
import kotlin.io.path.relativeTo
import kotlin.test.assertNotNull

class CodeWhispererYamlCodeScanTest : CodeWhispererCodeScanTestBase(PythonCodeInsightTestFixtureRule()) {

    private lateinit var testYaml: VirtualFile
    private lateinit var test2Yaml: VirtualFile
    private lateinit var test3Yaml: VirtualFile
    private lateinit var sessionConfigSpy: CloudFormationYamlCodeScanSessionConfig

    private var totalSize: Long = 0
    private var totalLines: Long = 0

    @Before
    override fun setup() {
        super.setup()
        setupYamlProject()
        sessionConfigSpy = spy(
            CodeScanSessionConfig.create(
                testYaml,
                project,
                CodeWhispererConstants.SecurityScanType.PROJECT
            ) as CloudFormationYamlCodeScanSessionConfig
        )
        setupResponse(testYaml.toNioPath().relativeTo(sessionConfigSpy.projectRoot.toNioPath()))

        mockClient.stub {
            onGeneric { createUploadUrl(any()) }.thenReturn(fakeCreateUploadUrlResponse)
            onGeneric { createCodeScan(any(), any()) }.thenReturn(fakeCreateCodeScanResponse)
            onGeneric { getCodeScan(any(), any()) }.thenReturn(fakeGetCodeScanResponse)
            onGeneric { listCodeScanFindings(any(), any()) }.thenReturn(fakeListCodeScanFindingsResponse)
        }
    }

    @Test
    fun `test createPayload`() {
        val payload = sessionConfigSpy.createPayload()
        assertNotNull(payload)
        assertThat(payload.context.totalFiles).isEqualTo(3)

        assertThat(payload.context.scannedFiles.size).isEqualTo(3)
        assertThat(payload.context.scannedFiles).containsExactly(testYaml, test3Yaml, test2Yaml)

        assertThat(payload.context.srcPayloadSize).isEqualTo(totalSize)
        assertThat(payload.context.language).isEqualTo(CodewhispererLanguage.Yaml)
        assertThat(payload.context.totalLines).isEqualTo(totalLines)
        assertNotNull(payload.srcZip)

        val bufferedInputStream = BufferedInputStream(payload.srcZip.inputStream())
        val zis = ZipInputStream(bufferedInputStream)
        var filesInZip = 0
        while (zis.nextEntry != null) {
            filesInZip += 1
        }

        assertThat(filesInZip).isEqualTo(3)
    }

    @Test
    fun `test getSourceFilesUnderProjectRoot`() {
        getSourceFilesUnderProjectRoot(sessionConfigSpy, testYaml, 3)
    }

    @Test
    fun `test getImportedFiles()`() {
        val files = sessionConfigSpy.getImportedFiles(testYaml, setOf())
        assertNotNull(files)
        assertThat(files).hasSize(0)
    }

    @Test
    fun `test includeDependencies()`() {
        includeDependencies(sessionConfigSpy, 3, totalSize, this.totalLines, 0)
    }

    @Test
    fun `test getTotalProjectSizeInBytes()`() {
        getTotalProjectSizeInBytes(sessionConfigSpy, this.totalSize)
    }

    @Test
    fun `selected file larger than payload limit throws exception`() {
        selectedFileLargerThanPayloadSizeThrowsException(sessionConfigSpy)
    }

    @Test
    fun `test createPayload with custom payload limit`() {
        sessionConfigSpy.stub {
            onGeneric { getPayloadLimitInBytes() }.thenReturn(900)
        }
        val payload = sessionConfigSpy.createPayload()
        assertNotNull(payload)
        assertThat(sessionConfigSpy.isProjectTruncated()).isTrue
        assertThat(payload.context.totalFiles).isEqualTo(1)

        assertThat(payload.context.scannedFiles.size).isEqualTo(1)
        assertThat(payload.context.scannedFiles).containsExactly(testYaml)

        assertThat(payload.context.srcPayloadSize).isEqualTo(301)
        assertThat(payload.context.language).isEqualTo(CodewhispererLanguage.Yaml)
        assertThat(payload.context.totalLines).isEqualTo(17)
        assertNotNull(payload.srcZip)

        val bufferedInputStream = BufferedInputStream(payload.srcZip.inputStream())
        val zis = ZipInputStream(bufferedInputStream)
        var filesInZip = 0
        while (zis.nextEntry != null) {
            filesInZip += 1
        }

        assertThat(filesInZip).isEqualTo(1)
    }

    @Test
    fun `e2e happy path integration test`() {
        assertE2ERunsSuccessfully(sessionConfigSpy, projectRule.project, totalLines, 3, totalSize, 2)
    }

    private fun setupYamlProject() {
        testYaml = projectRule.fixture.addFileToProject(
            "/testYaml.yaml",
            """
                AWSTemplateFormatVersion: "2010-09-09"
                
                Description: |
                  This stack creates a SNS topic using KMS encryption
                
                Parameters:
                  KmsKey:
                    Description: The KMS key master ID
                    Type: String
                
                Resources:
                
                  # A SNS topic
                  Topic:
                    Type: AWS::SNS::Topic
                    Properties:
                      KmsMasterKeyId: !Ref KmsKey
            """.trimIndent()
        ).virtualFile
        totalSize += testYaml.length
        totalLines += testYaml.toNioPath().toFile().readLines().size

        test2Yaml = projectRule.fixture.addFileToProject(
            "/test2Yaml.yaml",
            """
                AWSTemplateFormatVersion: "2010-09-09"
                
                Description: |
                  This stack creates a SQS queue using KMS encryption
                  with a SQS policy allowing the account that the 
                  queue is deployed into the ability to read and write
                  from the queue
                
                Parameters:
                  KmsKey:
                    Description: The KMS key master ID
                    Type: String
                
                Resources:
                  # An SQS queue
                  Queue:
                    UpdateReplacePolicy: Retain
                    DeletionPolicy: Retain
                    Type: AWS::SQS::Queue
                    Properties:
                      DelaySeconds: 0
                      FifoQueue: false
                      KmsDataKeyReusePeriodSeconds: 300
                      KmsMasterKeyId: !Ref KmsKey
                      MaximumMessageSize: 262144
                      MessageRetentionPeriod: 345600
                      ReceiveMessageWaitTimeSeconds: 0
                      VisibilityTimeout: 30
                
                  # An SQS queue policy for the account to read/write from the queue
                  QueuePolicy:
                    Type: AWS::SQS::QueuePolicy
                    Properties:
                      Queues:
                        - !GetAtt Queue.QueueUrl
                      PolicyDocument:
                        Statement:
                          - Action:
                              - SQS:SendMessage
                              - SQS:ReceiveMessage
                            Effect: Allow
                            Resource: !GetAtt Queue.Arn
                            Principal:
                              AWS:
                                - !Ref AWS::AccountId

            """.trimIndent()
        ).virtualFile
        totalSize += test2Yaml.length
        totalLines += test2Yaml.toNioPath().toFile().readLines().size

        test3Yaml = projectRule.fixture.addFileToProject(
            "/helpers/test3Yaml.yaml",
            """
                AWSTemplateFormatVersion: "2010-09-09"
                
                Description: |
                  This stack creates a SQS queue using KMS encryption
                
                Parameters:
                  KmsKey:
                    Description: The KMS key master ID
                    Type: String
                
                Resources:
                  # An SQS queue
                  Queue:
                    UpdateReplacePolicy: Retain
                    DeletionPolicy: Retain
                    Type: AWS::SQS::Queue
                    Properties:
                      DelaySeconds: 0
                      FifoQueue: false
                      KmsDataKeyReusePeriodSeconds: 300
                      KmsMasterKeyId: !Ref KmsKey
                      MaximumMessageSize: 262144
                      MessageRetentionPeriod: 345600
                      ReceiveMessageWaitTimeSeconds: 0
                      VisibilityTimeout: 30
                
                  # An SQS fifo queue
                  FifoQueue:
                    UpdateReplacePolicy: Retain
                    DeletionPolicy: Retain
                    Type: AWS::SQS::Queue
                    Properties:
                      ContentBasedDeduplication: true
                      DelaySeconds: 0
                      FifoQueue: True
                      KmsDataKeyReusePeriodSeconds: 300
                      KmsMasterKeyId: !Ref KmsKey
                      MaximumMessageSize: 262144
                      MessageRetentionPeriod: 345600
                      ReceiveMessageWaitTimeSeconds: 0
                      VisibilityTimeout: 30

            """.trimIndent()
        ).virtualFile
        totalSize += test3Yaml.length
        totalLines += test3Yaml.toNioPath().toFile().readLines().size

        projectRule.fixture.addFileToProject("/notIncluded.md", "### should NOT be included")
    }
}
