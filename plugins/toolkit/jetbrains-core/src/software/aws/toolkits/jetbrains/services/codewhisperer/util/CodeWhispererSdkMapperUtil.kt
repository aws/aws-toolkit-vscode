// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.util

import software.amazon.awssdk.services.codewhisperer.model.ArtifactType
import software.amazon.awssdk.services.codewhisperer.model.CodeAnalysisUploadContext
import software.amazon.awssdk.services.codewhisperer.model.CodeScanFindingsSchema
import software.amazon.awssdk.services.codewhisperer.model.CodeScanStatus
import software.amazon.awssdk.services.codewhisperer.model.CodeWhispererResponseMetadata
import software.amazon.awssdk.services.codewhisperer.model.CreateCodeScanRequest
import software.amazon.awssdk.services.codewhisperer.model.CreateCodeScanResponse
import software.amazon.awssdk.services.codewhisperer.model.CreateCodeScanUploadUrlRequest
import software.amazon.awssdk.services.codewhisperer.model.GetCodeScanRequest
import software.amazon.awssdk.services.codewhisperer.model.GetCodeScanResponse
import software.amazon.awssdk.services.codewhisperer.model.ListCodeScanFindingsRequest
import software.amazon.awssdk.services.codewhisperer.model.ListCodeScanFindingsResponse
import software.amazon.awssdk.services.codewhisperer.model.ProgrammingLanguage
import software.amazon.awssdk.services.codewhisperer.model.TaskAssistPlanningUploadContext
import software.amazon.awssdk.services.codewhisperer.model.TransformationUploadContext
import software.amazon.awssdk.services.codewhisperer.model.UploadContext
import software.amazon.awssdk.services.codewhispererruntime.model.CreateUploadUrlRequest
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

private fun ArtifactType.transform(): software.amazon.awssdk.services.codewhispererruntime.model.ArtifactType =
    software.amazon.awssdk.services.codewhispererruntime.model.ArtifactType.fromValue(this.toString())

private fun CodeScanFindingsSchema.transform(): software.amazon.awssdk.services.codewhispererruntime.model.CodeAnalysisFindingsSchema =
    software.amazon.awssdk.services.codewhispererruntime.model.CodeAnalysisFindingsSchema.fromValue(
        this.toString().replace("scan", "analysis")
    )

private fun UploadContext.transform(): software.amazon.awssdk.services.codewhispererruntime.model.UploadContext =
    software.amazon.awssdk.services.codewhispererruntime.model.UploadContext.builder()
        .taskAssistPlanningUploadContext(this.taskAssistPlanningUploadContext().transform())
        .transformationUploadContext(this.transformationUploadContext().transform())
        .codeAnalysisUploadContext(this.codeAnalysisUploadContext().transform())
        .build()

private fun TaskAssistPlanningUploadContext.transform(): software.amazon.awssdk.services.codewhispererruntime.model.TaskAssistPlanningUploadContext =
    software.amazon.awssdk.services.codewhispererruntime.model.TaskAssistPlanningUploadContext.builder()
        .conversationId(this.conversationId())
        .build()

private fun TransformationUploadContext.transform(): software.amazon.awssdk.services.codewhispererruntime.model.TransformationUploadContext =
    software.amazon.awssdk.services.codewhispererruntime.model.TransformationUploadContext.builder()
        .jobId(this.jobId())
        .uploadArtifactType(this.uploadArtifactTypeAsString())
        .build()

private fun CodeAnalysisUploadContext.transform(): software.amazon.awssdk.services.codewhispererruntime.model.CodeAnalysisUploadContext =
    software.amazon.awssdk.services.codewhispererruntime.model.CodeAnalysisUploadContext.builder()
        .codeScanName(this.codeScanName())
        .build()

private fun software.amazon.awssdk.services.codewhispererruntime.model.CodeAnalysisStatus.transform(): CodeScanStatus =
    CodeScanStatus.fromValue(this.toString())

fun CreateCodeScanUploadUrlRequest.transform(): CreateUploadUrlRequest =
    CreateUploadUrlRequest.builder()
        .contentMd5(this.contentMd5())
        .artifactType(this.artifactType().transform())
        .uploadIntent(this.uploadIntent().toString())
        .uploadContext(this.uploadContext().transform())
        .build()

fun CreateCodeScanRequest.transform(): StartCodeAnalysisRequest =
    StartCodeAnalysisRequest.builder()
        .artifacts(this.artifacts().entries.map { it.key.transform() to it.value }.toMap())
        .programmingLanguage(this.programmingLanguage().transform())
        .clientToken(this.clientToken())
        .scope(this.scopeAsString())
        .codeScanName(this.codeScanName())
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
