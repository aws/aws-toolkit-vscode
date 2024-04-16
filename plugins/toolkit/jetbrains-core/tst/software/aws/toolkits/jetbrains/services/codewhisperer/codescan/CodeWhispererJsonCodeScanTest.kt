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
import software.aws.toolkits.jetbrains.services.codewhisperer.codescan.sessionconfig.CodeScanSessionConfig
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants
import software.aws.toolkits.jetbrains.utils.rules.PythonCodeInsightTestFixtureRule
import software.aws.toolkits.telemetry.CodewhispererLanguage
import java.io.BufferedInputStream
import java.util.zip.ZipInputStream
import kotlin.io.path.relativeTo
import kotlin.test.assertNotNull

class CodeWhispererJsonCodeScanTest : CodeWhispererCodeScanTestBase(PythonCodeInsightTestFixtureRule()) {

    private lateinit var testJson: VirtualFile
    private lateinit var test2Json: VirtualFile
    private lateinit var test3Json: VirtualFile
    private lateinit var readMeMd: VirtualFile
    private lateinit var sessionConfigSpy: CodeScanSessionConfig

    private var totalSize: Long = 0
    private var totalLines: Long = 0

    @Before
    override fun setup() {
        super.setup()
        setupJsonProject()
        sessionConfigSpy = spy(
            CodeScanSessionConfig.create(
                testJson,
                project,
                CodeWhispererConstants.SecurityScanType.PROJECT
            )
        )
        setupResponse(testJson.toNioPath().relativeTo(sessionConfigSpy.projectRoot.toNioPath()))

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
        assertThat(payload.context.totalFiles).isEqualTo(4)

        assertThat(payload.context.scannedFiles.size).isEqualTo(4)
        assertThat(payload.context.scannedFiles).containsExactly(testJson, test3Json, readMeMd, test2Json)

        assertThat(payload.context.srcPayloadSize).isEqualTo(totalSize)
        assertThat(payload.context.language).isEqualTo(CodewhispererLanguage.Json)
        assertThat(payload.context.totalLines).isEqualTo(totalLines)
        assertNotNull(payload.srcZip)

        val bufferedInputStream = BufferedInputStream(payload.srcZip.inputStream())
        val zis = ZipInputStream(bufferedInputStream)
        var filesInZip = 0
        while (zis.nextEntry != null) {
            filesInZip += 1
        }

        assertThat(filesInZip).isEqualTo(4)
    }

    @Test
    fun `test getSourceFilesUnderProjectRoot`() {
        getSourceFilesUnderProjectRoot(sessionConfigSpy, testJson, 4)
    }

    @Test
    fun `test includeDependencies()`() {
        includeDependencies(sessionConfigSpy, 4, totalSize, this.totalLines, 0)
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
        assertThat(payload.context.scannedFiles).containsExactly(testJson)

        assertThat(payload.context.srcPayloadSize).isEqualTo(488)
        assertThat(payload.context.language).isEqualTo(CodewhispererLanguage.Json)
        assertThat(payload.context.totalLines).isEqualTo(20)
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
        assertE2ERunsSuccessfully(sessionConfigSpy, projectRule.project, totalLines, 4, totalSize, 2)
    }

    private fun setupJsonProject() {
        testJson = projectRule.fixture.addFileToProject(
            "/testJson.json",
            """
                {
                    "AWSTemplateFormatVersion": "2010-09-09",
                    "Description": "This stack creates a SNS topic using KMS encryption\n",
                    "Parameters": {
                        "KmsKey": {
                            "Description": "The KMS key master ID",
                            "Type": "String"
                        }
                    },
                    "Resources": {
                        "Topic": {
                            "Type": "AWS::SNS::Topic",
                            "Properties": {
                                "KmsMasterKeyId": {
                                    "Ref": "KmsKey"
                                }
                            }
                        }
                    }
                }
            """.trimIndent()
        ).virtualFile
        totalSize += testJson.length
        totalLines += testJson.toNioPath().toFile().readLines().size

        test2Json = projectRule.fixture.addFileToProject(
            "/test2Json.json",
            """
                {
                    "AWSTemplateFormatVersion": "2010-09-09",
                    "Description": "This stack creates a SQS queue using KMS encryption\nwith a SQS policy allowing the account that the \nqueue is deployed into the ability to read and write\nfrom the queue\n",
                    "Parameters": {
                        "KmsKey": {
                            "Description": "The KMS key master ID",
                            "Type": "String"
                        }
                    },
                    "Resources": {
                        "Queue": {
                            "DeletionPolicy": "Retain",
                            "UpdateReplacePolicy": "Retain",
                            "Type": "AWS::SQS::Queue",
                            "Properties": {
                                "DelaySeconds": 0,
                                "FifoQueue": false,
                                "KmsDataKeyReusePeriodSeconds": 300,
                                "KmsMasterKeyId": {
                                    "Ref": "KmsKey"
                                },
                                "MaximumMessageSize": 262144,
                                "MessageRetentionPeriod": 345600,
                                "ReceiveMessageWaitTimeSeconds": 0,
                                "VisibilityTimeout": 30
                            }
                        },
                        "QueuePolicy": {
                            "Type": "AWS::SQS::QueuePolicy",
                            "Properties": {
                                "Queues": [
                                    {
                                        "Fn::GetAtt": [
                                            "Queue",
                                            "QueueUrl"
                                        ]
                                    }
                                ],
                                "PolicyDocument": {
                                    "Statement": [
                                        {
                                            "Action": [
                                                "SQS:SendMessage",
                                                "SQS:ReceiveMessage"
                                            ],
                                            "Effect": "Allow",
                                            "Resource": {
                                                "Fn::GetAtt": [
                                                    "Queue",
                                                    "Arn"
                                                ]
                                            },
                                            "Principal": {
                                                "AWS": [
                                                    {
                                                        "Ref": "AWS::AccountId"
                                                    }
                                                ]
                                            }
                                        }
                                    ]
                                }
                            }
                        }
                    }
                }
            """.trimIndent()
        ).virtualFile
        totalSize += test2Json.length
        totalLines += test2Json.toNioPath().toFile().readLines().size

        test3Json = projectRule.fixture.addFileToProject(
            "/helpers/test3Json.json",
            """
                {
                    "AWSTemplateFormatVersion": "2010-09-09",
                    "Description": "This stack creates a SQS queue using KMS encryption\n",
                    "Parameters": {
                        "KmsKey": {
                            "Description": "The KMS key master ID",
                            "Type": "String"
                        }
                    },
                    "Resources": {
                        "Queue": {
                            "DeletionPolicy": "Retain",
                            "UpdateReplacePolicy": "Retain",
                            "Type": "AWS::SQS::Queue",
                            "Properties": {
                                "DelaySeconds": 0,
                                "FifoQueue": false,
                                "KmsDataKeyReusePeriodSeconds": 300,
                                "KmsMasterKeyId": {
                                    "Ref": "KmsKey"
                                },
                                "MaximumMessageSize": 262144,
                                "MessageRetentionPeriod": 345600,
                                "ReceiveMessageWaitTimeSeconds": 0,
                                "VisibilityTimeout": 30
                            }
                        },
                        "FifoQueue": {
                            "DeletionPolicy": "Retain",
                            "UpdateReplacePolicy": "Retain",
                            "Type": "AWS::SQS::Queue",
                            "Properties": {
                                "ContentBasedDeduplication": true,
                                "DelaySeconds": 0,
                                "FifoQueue": true,
                                "KmsDataKeyReusePeriodSeconds": 300,
                                "KmsMasterKeyId": {
                                    "Ref": "KmsKey"
                                },
                                "MaximumMessageSize": 262144,
                                "MessageRetentionPeriod": 345600,
                                "ReceiveMessageWaitTimeSeconds": 0,
                                "VisibilityTimeout": 30
                            }
                        }
                    }
                }
            """.trimIndent()
        ).virtualFile
        totalSize += test3Json.length
        totalLines += test3Json.toNioPath().toFile().readLines().size

        readMeMd = projectRule.fixture.addFileToProject("/ReadMe.md", "### Now included").virtualFile
        totalSize += readMeMd.length
        totalLines += readMeMd.toNioPath().toFile().readLines().size
    }
}
