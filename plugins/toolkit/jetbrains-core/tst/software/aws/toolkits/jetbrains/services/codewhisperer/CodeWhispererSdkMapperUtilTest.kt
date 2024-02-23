// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer

import org.assertj.core.api.Assertions.assertThat
import org.junit.Test
import software.amazon.awssdk.services.codewhisperer.model.ArtifactType
import software.amazon.awssdk.services.codewhisperer.model.CodeScanFindingsSchema
import software.amazon.awssdk.services.codewhisperer.model.CreateCodeScanRequest
import software.amazon.awssdk.services.codewhisperer.model.CreateCodeScanResponse
import software.amazon.awssdk.services.codewhisperer.model.GetCodeScanRequest
import software.amazon.awssdk.services.codewhisperer.model.GetCodeScanResponse
import software.amazon.awssdk.services.codewhisperer.model.ListCodeScanFindingsRequest
import software.amazon.awssdk.services.codewhispererruntime.model.CodeAnalysisFindingsSchema
import software.amazon.awssdk.services.codewhispererruntime.model.CodeAnalysisStatus
import software.amazon.awssdk.services.codewhispererruntime.model.GetCodeAnalysisRequest
import software.amazon.awssdk.services.codewhispererruntime.model.GetCodeAnalysisResponse
import software.amazon.awssdk.services.codewhispererruntime.model.ListCodeAnalysisFindingsResponse
import software.amazon.awssdk.services.codewhispererruntime.model.StartCodeAnalysisRequest
import software.amazon.awssdk.services.codewhispererruntime.model.StartCodeAnalysisResponse
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.metadata
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.sdkHttpResponse
import software.aws.toolkits.jetbrains.services.codewhisperer.util.transform

class CodeWhispererSdkMapperUtilTest {
    // TODO: revisit these test cases since if we miss one field, they don't capture

    @Test
    fun `CreateCodeScanRequest`() {
        val expected = CreateCodeScanRequest.builder()
            .programmingLanguage { it.languageName("python") }
            .artifacts(mapOf(ArtifactType.SOURCE_CODE to "1", ArtifactType.BUILT_JARS to "2"))
            .clientToken("token")
            .build()

        val actual = expected.transform()
        assertThat(actual)
            .isNotNull
            .isInstanceOf(StartCodeAnalysisRequest::class.java)
            .usingRecursiveComparison()
            .isEqualTo(expected)
    }

    @Test
    fun `StartCodeAnalysisResponse`() {
        val expected = StartCodeAnalysisResponse.builder()
            .jobId("jobid")
            .status(CodeAnalysisStatus.PENDING)
            .errorMessage("msg")
            .responseMetadata(metadata)
            .sdkHttpResponse(sdkHttpResponse)
            .build() as StartCodeAnalysisResponse

        val actual = expected.transform()
        assertThat(actual)
            .isNotNull
            .isInstanceOf(CreateCodeScanResponse::class.java)
            .usingRecursiveComparison()
            .isEqualTo(expected)
    }

    @Test
    fun `GetCodeScanRequest`() {
        val expected = GetCodeScanRequest.builder()
            .jobId("123")
            .build()

        val actual = expected.transform()
        assertThat(actual)
            .isNotNull
            .isInstanceOf(GetCodeAnalysisRequest::class.java)
            .usingRecursiveComparison()
            .isEqualTo(expected)
    }

    @Test
    fun `GetCodeAnalysisResponse`() {
        val expected = GetCodeAnalysisResponse.builder()
            .status(CodeAnalysisStatus.COMPLETED)
            .errorMessage("msg")
            .responseMetadata(metadata)
            .sdkHttpResponse(sdkHttpResponse)
            .build() as GetCodeAnalysisResponse

        val actual = expected.transform()
        assertThat(actual)
            .isNotNull
            .isInstanceOf(GetCodeScanResponse::class.java)
            .usingRecursiveComparison()
            .isEqualTo(expected)
    }

    @Test
    fun `ListCodeScanFindingsRequest`() {
        val expected = ListCodeScanFindingsRequest.builder()
            .codeScanFindingsSchema(CodeScanFindingsSchema.CODESCAN_FINDINGS_1_0)
            .jobId("id")
            .nextToken("123")
            .build()

        val actual = expected.transform()
        assertThat(actual.jobId()).isEqualTo(expected.jobId())
        assertThat(actual.nextToken()).isEqualTo(expected.nextToken())
        assertThat(actual.codeAnalysisFindingsSchema()).isEqualTo(CodeAnalysisFindingsSchema.CODEANALYSIS_FINDINGS_1_0)
    }

    @Test
    fun `ListCodeAnalysisFindingsResponse`() {
        val expected = ListCodeAnalysisFindingsResponse.builder()
            .codeAnalysisFindings(CodeScanFindingsSchema.UNKNOWN_TO_SDK_VERSION.toString()) // the model provided only has builder.codeScanFindings(String)
            .nextToken("token")
            .responseMetadata(metadata)
            .sdkHttpResponse(sdkHttpResponse)
            .build() as ListCodeAnalysisFindingsResponse

        val actual = expected.transform()
        assertThat(actual.nextToken())
            .isNotNull
            .isInstanceOf(String::class.java)
            .isEqualTo(expected.nextToken())
        assertThat(actual.codeScanFindings())
            .isNotNull
            .isInstanceOf(String::class.java)
            .isEqualTo(expected.codeAnalysisFindings())
    }
}
