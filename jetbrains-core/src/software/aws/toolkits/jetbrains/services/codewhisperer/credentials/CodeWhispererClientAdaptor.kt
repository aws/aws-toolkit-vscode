// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.credentials

import com.intellij.openapi.Disposable
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import software.amazon.awssdk.auth.credentials.AnonymousCredentialsProvider
import software.amazon.awssdk.services.codewhisperer.CodeWhispererClient
import software.amazon.awssdk.services.codewhisperer.model.CreateCodeScanRequest
import software.amazon.awssdk.services.codewhisperer.model.CreateCodeScanResponse
import software.amazon.awssdk.services.codewhisperer.model.CreateUploadUrlRequest
import software.amazon.awssdk.services.codewhisperer.model.CreateUploadUrlResponse
import software.amazon.awssdk.services.codewhisperer.model.GetCodeScanRequest
import software.amazon.awssdk.services.codewhisperer.model.GetCodeScanResponse
import software.amazon.awssdk.services.codewhisperer.model.ListCodeScanFindingsRequest
import software.amazon.awssdk.services.codewhisperer.model.ListCodeScanFindingsResponse
import software.amazon.awssdk.services.codewhisperer.model.ListRecommendationsRequest
import software.amazon.awssdk.services.codewhisperer.model.ListRecommendationsResponse
import software.amazon.awssdk.services.codewhispererruntime.CodeWhispererRuntimeClient
import software.aws.toolkits.jetbrains.core.AwsClientManager
import software.aws.toolkits.jetbrains.core.credentials.AwsBearerTokenConnection
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.pinning.CodeWhispererConnection
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.CodeWhispererExplorerActionManager
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants
import software.aws.toolkits.jetbrains.services.codewhisperer.util.transform

// TODO: move this file to package "/client"
// As the connection is project-level, we need to make this project-level too
interface CodeWhispererClientAdaptor : Disposable {
    val project: Project

    fun listRecommendationsPaginator(
        firstRequest: ListRecommendationsRequest,
        isSigv4: Boolean = shouldUseSigv4Client(project)
    ): Sequence<ListRecommendationsResponse>

    fun createUploadUrl(
        request: CreateUploadUrlRequest,
        isSigv4: Boolean = shouldUseSigv4Client(project)
    ): CreateUploadUrlResponse

    fun createCodeScan(
        request: CreateCodeScanRequest,
        isSigv4: Boolean = shouldUseSigv4Client(project)
    ): CreateCodeScanResponse

    fun getCodeScan(
        request: GetCodeScanRequest,
        isSigv4: Boolean = shouldUseSigv4Client(project)
    ): GetCodeScanResponse

    fun listCodeScanFindings(
        request: ListCodeScanFindingsRequest,
        isSigv4: Boolean = shouldUseSigv4Client(project)
    ): ListCodeScanFindingsResponse

    companion object {
        fun getInstance(project: Project): CodeWhispererClientAdaptor = project.service()

        private fun shouldUseSigv4Client(project: Project) =
            CodeWhispererExplorerActionManager.getInstance().checkActiveCodeWhispererConnectionType(project) == CodeWhispererLoginType.Accountless
    }
}

class CodeWhispererClientAdaptorImpl(override val project: Project) : CodeWhispererClientAdaptor {
    private val mySigv4Client by lazy { createUnmanagedSigv4Client() }

    private val myBearerClient: CodeWhispererRuntimeClient
        get() = getBearerClient(project)

    override fun listRecommendationsPaginator(firstRequest: ListRecommendationsRequest, isSigv4: Boolean) = sequence<ListRecommendationsResponse> {
        var nextToken: String? = firstRequest.nextToken()
        do {
            val response = if (isSigv4) {
                mySigv4Client.listRecommendations(firstRequest.copy { it.nextToken(nextToken) })
            } else {
                myBearerClient.generateCompletions(firstRequest.copy { it.nextToken(nextToken) }.transform()).transform()
            }
            nextToken = response.nextToken()
            yield(response)
        } while (!nextToken.isNullOrEmpty())
    }

    override fun createUploadUrl(request: CreateUploadUrlRequest, isSigv4: Boolean): CreateUploadUrlResponse =
        if (isSigv4) {
            mySigv4Client.createUploadUrl(request)
        } else {
            myBearerClient.createArtifactUploadUrl(request.transform()).transform()
        }

    override fun createCodeScan(request: CreateCodeScanRequest, isSigv4: Boolean): CreateCodeScanResponse =
        if (isSigv4) {
            mySigv4Client.createCodeScan(request)
        } else {
            myBearerClient.startCodeAnalysis(request.transform()).transform()
        }

    override fun getCodeScan(request: GetCodeScanRequest, isSigv4: Boolean): GetCodeScanResponse =
        if (isSigv4) {
            mySigv4Client.getCodeScan(request)
        } else {
            myBearerClient.getCodeAnalysis(request.transform()).transform()
        }

    override fun listCodeScanFindings(request: ListCodeScanFindingsRequest, isSigv4: Boolean): ListCodeScanFindingsResponse =
        if (isSigv4) {
            mySigv4Client.listCodeScanFindings(request)
        } else {
            myBearerClient.listCodeAnalysisFindings(request.transform()).transform()
        }

    override fun dispose() {
        mySigv4Client.close()
    }

    companion object {
        private fun createUnmanagedSigv4Client(): CodeWhispererClient = AwsClientManager.getInstance().createUnmanagedClient(
            AnonymousCredentialsProvider.create(),
            CodeWhispererConstants.Config.Sigv4ClientRegion,
            CodeWhispererConstants.Config.CODEWHISPERER_ENDPOINT
        )

        /**
         * Every different SSO/AWS Builder ID connection requires a new client which has its correspoding bearer token provider,
         * thus we have to create them dynamically.
         */
        private fun getBearerClient(project: Project): CodeWhispererRuntimeClient {
            val connection = ToolkitConnectionManager.getInstance(project).activeConnectionForFeature(CodeWhispererConnection.getInstance())
            connection as? AwsBearerTokenConnection ?: error("$connection is not a bearer token connection")
            return AwsClientManager.getInstance().getClient<CodeWhispererRuntimeClient>(connection.getConnectionSettings())
        }
    }
}
