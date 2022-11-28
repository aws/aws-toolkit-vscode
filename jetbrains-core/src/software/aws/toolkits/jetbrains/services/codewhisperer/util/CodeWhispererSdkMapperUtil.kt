// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.util

import software.amazon.awssdk.services.codewhisperer.model.ArtifactType
import software.amazon.awssdk.services.codewhisperer.model.CodeScanFindingsSchema
import software.amazon.awssdk.services.codewhisperer.model.CodeScanStatus
import software.amazon.awssdk.services.codewhisperer.model.CodeWhispererResponseMetadata
import software.amazon.awssdk.services.codewhisperer.model.CreateCodeScanRequest
import software.amazon.awssdk.services.codewhisperer.model.CreateCodeScanResponse
import software.amazon.awssdk.services.codewhisperer.model.CreateUploadUrlRequest
import software.amazon.awssdk.services.codewhisperer.model.CreateUploadUrlResponse
import software.amazon.awssdk.services.codewhisperer.model.FileContext
import software.amazon.awssdk.services.codewhisperer.model.GetCodeScanRequest
import software.amazon.awssdk.services.codewhisperer.model.GetCodeScanResponse
import software.amazon.awssdk.services.codewhisperer.model.ListCodeScanFindingsRequest
import software.amazon.awssdk.services.codewhisperer.model.ListCodeScanFindingsResponse
import software.amazon.awssdk.services.codewhisperer.model.ListRecommendationsRequest
import software.amazon.awssdk.services.codewhisperer.model.ListRecommendationsResponse
import software.amazon.awssdk.services.codewhisperer.model.ProgrammingLanguage
import software.amazon.awssdk.services.codewhisperer.model.Recommendation
import software.amazon.awssdk.services.codewhisperer.model.RecommendationsWithReferencesPreference
import software.amazon.awssdk.services.codewhisperer.model.Reference
import software.amazon.awssdk.services.codewhisperer.model.ReferenceTrackerConfiguration
import software.amazon.awssdk.services.codewhisperer.model.Span
import software.amazon.awssdk.services.codewhispererruntime.model.CreateArtifactUploadUrlRequest
import software.amazon.awssdk.services.codewhispererruntime.model.CreateArtifactUploadUrlResponse
import software.amazon.awssdk.services.codewhispererruntime.model.GenerateCompletionsRequest
import software.amazon.awssdk.services.codewhispererruntime.model.GenerateCompletionsResponse
import software.amazon.awssdk.services.codewhispererruntime.model.GetCodeAnalysisRequest
import software.amazon.awssdk.services.codewhispererruntime.model.GetCodeAnalysisResponse
import software.amazon.awssdk.services.codewhispererruntime.model.ListCodeAnalysisFindingsRequest
import software.amazon.awssdk.services.codewhispererruntime.model.ListCodeAnalysisFindingsResponse
import software.amazon.awssdk.services.codewhispererruntime.model.StartCodeAnalysisRequest
import software.amazon.awssdk.services.codewhispererruntime.model.StartCodeAnalysisResponse

// TODO: rename to be a more imformative name
private fun ProgrammingLanguage.transform(): software.amazon.awssdk.services.codewhispererruntime.model.ProgrammingLanguage =
    software.amazon.awssdk.services.codewhispererruntime.model.ProgrammingLanguage.builder()
        .languageName(this.languageName())
        .build()

private fun FileContext.transform(): software.amazon.awssdk.services.codewhispererruntime.model.FileContext =
    software.amazon.awssdk.services.codewhispererruntime.model.FileContext.builder()
        .leftFileContent(this.leftFileContent())
        .rightFileContent(this.rightFileContent())
        .programmingLanguage(this.programmingLanguage().transform())
        .filename(this.filename())
        .build()

private fun ReferenceTrackerConfiguration.transform(): software.amazon.awssdk.services.codewhispererruntime.model.ReferenceTrackerConfiguration =
    software.amazon.awssdk.services.codewhispererruntime.model.ReferenceTrackerConfiguration.builder()
        .recommendationsWithReferences(this.recommendationsWithReferences().transform())
        .build()

private fun RecommendationsWithReferencesPreference.transform():
    software.amazon.awssdk.services.codewhispererruntime.model.RecommendationsWithReferencesPreference =
    software.amazon.awssdk.services.codewhispererruntime.model.RecommendationsWithReferencesPreference.fromValue(this.toString())

private fun ArtifactType.transform(): software.amazon.awssdk.services.codewhispererruntime.model.ArtifactType =
    software.amazon.awssdk.services.codewhispererruntime.model.ArtifactType.fromValue(this.toString())

private fun CodeScanFindingsSchema.transform(): software.amazon.awssdk.services.codewhispererruntime.model.CodeAnalysisFindingsSchema =
    software.amazon.awssdk.services.codewhispererruntime.model.CodeAnalysisFindingsSchema.fromValue(
        this.toString().replace("scan", "analysis")
    )

private fun software.amazon.awssdk.services.codewhispererruntime.model.Span.transform(): Span =
    Span.builder()
        .start(this.start())
        .end(this.end())
        .build()

private fun software.amazon.awssdk.services.codewhispererruntime.model.Reference.transform(): Reference =
    Reference.builder()
        .licenseName(this.licenseName())
        .url(this.url())
        .repository(this.repository())
        .recommendationContentSpan(this.recommendationContentSpan().transform())
        .build()

private fun software.amazon.awssdk.services.codewhispererruntime.model.Completion.transform(): Recommendation =
    Recommendation.builder()
        .content(this.content())
        .references(this.references().map { it.transform() })
        .build()

private fun software.amazon.awssdk.services.codewhispererruntime.model.CodeAnalysisStatus.transform(): CodeScanStatus =
    CodeScanStatus.fromValue(this.toString())

fun ListRecommendationsRequest.transform(): GenerateCompletionsRequest =
    GenerateCompletionsRequest.builder()
        .fileContext(this.fileContext().transform())
        .referenceTrackerConfiguration(this.referenceTrackerConfiguration().transform())
        .nextToken(this.nextToken())
        .maxResults(this.maxResults())
        .build()

fun GenerateCompletionsResponse.transform(): ListRecommendationsResponse =
    ListRecommendationsResponse.builder()
        .nextToken(this.nextToken())
        .recommendations(this.completions().map { it.transform() })
        .responseMetadata(CodeWhispererResponseMetadata.create(this.responseMetadata()))
        .sdkHttpResponse(this.sdkHttpResponse())
        .build() as ListRecommendationsResponse

fun CreateUploadUrlRequest.transform(): CreateArtifactUploadUrlRequest =
    CreateArtifactUploadUrlRequest.builder()
        .contentMd5(this.contentMd5())
        .artifactType(this.artifactType().transform())
        .build()

fun CreateArtifactUploadUrlResponse.transform(): CreateUploadUrlResponse =
    CreateUploadUrlResponse.builder()
        .uploadId(this.uploadId())
        .uploadUrl(this.uploadUrl())
        .responseMetadata(CodeWhispererResponseMetadata.create(this.responseMetadata()))
        .sdkHttpResponse(this.sdkHttpResponse())
        .build() as CreateUploadUrlResponse

fun CreateCodeScanRequest.transform(): StartCodeAnalysisRequest =
    StartCodeAnalysisRequest.builder()
        .artifacts(this.artifacts().entries.map { it.key.transform() to it.value }.toMap())
        .programmingLanguage(this.programmingLanguage().transform())
        .clientToken(this.clientToken())
        .build()

fun StartCodeAnalysisResponse.transform(): CreateCodeScanResponse =
    CreateCodeScanResponse.builder()
        .jobId(this.jobId())
        .status(this.status().transform())
        .errorMessage(this.errorMessage())
        .responseMetadata(CodeWhispererResponseMetadata.create(this.responseMetadata()))
        .sdkHttpResponse(this.sdkHttpResponse())
        .build() as CreateCodeScanResponse

fun GetCodeScanRequest.transform(): GetCodeAnalysisRequest =
    GetCodeAnalysisRequest.builder()
        .jobId(this.jobId())
        .build()

fun GetCodeAnalysisResponse.transform(): GetCodeScanResponse =
    GetCodeScanResponse.builder()
        .status(this.status().transform())
        .errorMessage(this.errorMessage())
        .responseMetadata(CodeWhispererResponseMetadata.create(this.responseMetadata()))
        .sdkHttpResponse(this.sdkHttpResponse())
        .build() as GetCodeScanResponse

fun ListCodeScanFindingsRequest.transform(): ListCodeAnalysisFindingsRequest =
    ListCodeAnalysisFindingsRequest.builder()
        .jobId(this.jobId())
        .nextToken(this.nextToken())
        .codeAnalysisFindingsSchema(this.codeScanFindingsSchema().transform())
        .build()

fun ListCodeAnalysisFindingsResponse.transform(): ListCodeScanFindingsResponse = ListCodeScanFindingsResponse
    .builder()
    .codeScanFindings(this.codeAnalysisFindings())
    .nextToken(this.nextToken())
    .responseMetadata(CodeWhispererResponseMetadata.create(this.responseMetadata()))
    .sdkHttpResponse(this.sdkHttpResponse())
    .build() as ListCodeScanFindingsResponse
