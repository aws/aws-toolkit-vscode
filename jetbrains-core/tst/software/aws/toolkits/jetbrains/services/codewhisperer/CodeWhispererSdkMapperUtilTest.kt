// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer

import org.assertj.core.api.Assertions.assertThat
import org.junit.Test
import software.amazon.awssdk.services.codewhisperer.model.ArtifactType
import software.amazon.awssdk.services.codewhisperer.model.CodeScanFindingsSchema
import software.amazon.awssdk.services.codewhisperer.model.CreateCodeScanRequest
import software.amazon.awssdk.services.codewhisperer.model.CreateCodeScanResponse
import software.amazon.awssdk.services.codewhisperer.model.CreateUploadUrlResponse
import software.amazon.awssdk.services.codewhisperer.model.GetCodeScanRequest
import software.amazon.awssdk.services.codewhisperer.model.GetCodeScanResponse
import software.amazon.awssdk.services.codewhisperer.model.ListCodeScanFindingsRequest
import software.amazon.awssdk.services.codewhispererruntime.model.CodeAnalysisFindingsSchema
import software.amazon.awssdk.services.codewhispererruntime.model.CodeAnalysisStatus
import software.amazon.awssdk.services.codewhispererruntime.model.Completion
import software.amazon.awssdk.services.codewhispererruntime.model.CreateArtifactUploadUrlRequest
import software.amazon.awssdk.services.codewhispererruntime.model.CreateArtifactUploadUrlResponse
import software.amazon.awssdk.services.codewhispererruntime.model.GenerateCompletionsRequest
import software.amazon.awssdk.services.codewhispererruntime.model.GenerateCompletionsResponse
import software.amazon.awssdk.services.codewhispererruntime.model.GetCodeAnalysisRequest
import software.amazon.awssdk.services.codewhispererruntime.model.GetCodeAnalysisResponse
import software.amazon.awssdk.services.codewhispererruntime.model.ListCodeAnalysisFindingsResponse
import software.amazon.awssdk.services.codewhispererruntime.model.Reference
import software.amazon.awssdk.services.codewhispererruntime.model.Span
import software.amazon.awssdk.services.codewhispererruntime.model.StartCodeAnalysisRequest
import software.amazon.awssdk.services.codewhispererruntime.model.StartCodeAnalysisResponse
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.metadata
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.pythonRequest
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.sdkHttpResponse
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.testNextToken
import software.aws.toolkits.jetbrains.services.codewhisperer.util.transform

class CodeWhispererSdkMapperUtilTest {
    // TODO: revisit these test cases since if we miss one field, they don't capture
    @Test
    fun `ListRecommendationsRequest`() {
        val expected = pythonRequest
        val actual = pythonRequest.transform()
        assertThat(actual).isInstanceOf(GenerateCompletionsRequest::class.java)
        assertThat(actual.fileContext())
            .usingRecursiveComparison()
            .isEqualTo(expected.fileContext())
    }

    @Test
    fun `GenerateCompletionsResponse`() {
        val expected = GenerateCompletionsResponse.builder()
            .completions(
                Completion.builder()
                    .content("foo")
                    .references(
                        Reference.builder()
                            .licenseName("license")
                            .recommendationContentSpan(
                                Span.builder()
                                    .start(0)
                                    .end(1)
                                    .build()
                            )
                            .build()
                    )
                    .build()
            )
            .nextToken(testNextToken)
            .responseMetadata(metadata)
            .sdkHttpResponse(sdkHttpResponse)
            .build() as GenerateCompletionsResponse

        val actual = expected.transform()
        assertThat(actual.nextToken())
            .isNotNull
            .isInstanceOf(String::class.java)
            .isEqualTo(expected.nextToken())
        assertThat(actual.recommendations())
            .isNotNull
            .usingRecursiveComparison()
            .isEqualTo(expected.completions())
    }

    @Test
    fun `CreateUploadUrlRequest`() {
        val expected = software.amazon.awssdk.services.codewhisperer.model.CreateUploadUrlRequest.builder()
            .artifactType(ArtifactType.BUILT_JARS)
            .contentMd5("md5")
            .build()

        val actual = expected.transform()
        assertThat(actual)
            .isNotNull
            .isInstanceOf(CreateArtifactUploadUrlRequest::class.java)
            .usingRecursiveComparison()
            .isEqualTo(expected)
    }

    @Test
    fun `CreateArtifactUploadUrlResponse`() {
        val expected = CreateArtifactUploadUrlResponse.builder()
            .uploadId("id")
            .uploadUrl("url")
            .responseMetadata(metadata)
            .sdkHttpResponse(sdkHttpResponse)
            .build() as CreateArtifactUploadUrlResponse

        val actual = expected.transform()
        assertThat(actual)
            .isNotNull
            .isInstanceOf(CreateUploadUrlResponse::class.java)
            .usingRecursiveComparison()
            .isEqualTo(expected)
    }

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
