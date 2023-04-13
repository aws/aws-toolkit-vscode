// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.credentials

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import software.amazon.awssdk.auth.credentials.AnonymousCredentialsProvider
import software.amazon.awssdk.services.codewhisperer.CodeWhispererClient
import software.amazon.awssdk.services.codewhisperer.model.CreateCodeScanRequest
import software.amazon.awssdk.services.codewhisperer.model.CreateCodeScanResponse
import software.amazon.awssdk.services.codewhisperer.model.GetCodeScanRequest
import software.amazon.awssdk.services.codewhisperer.model.GetCodeScanResponse
import software.amazon.awssdk.services.codewhisperer.model.ListCodeScanFindingsRequest
import software.amazon.awssdk.services.codewhisperer.model.ListCodeScanFindingsResponse
import software.amazon.awssdk.services.codewhispererruntime.CodeWhispererRuntimeClient
import software.amazon.awssdk.services.codewhispererruntime.model.CreateUploadUrlRequest
import software.amazon.awssdk.services.codewhispererruntime.model.CreateUploadUrlResponse
import software.amazon.awssdk.services.codewhispererruntime.model.GenerateCompletionsRequest
import software.amazon.awssdk.services.codewhispererruntime.model.GenerateCompletionsResponse
import software.aws.toolkits.jetbrains.core.AwsClientManager
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.core.credentials.AwsBearerTokenConnection
import software.aws.toolkits.jetbrains.core.credentials.CredentialManager.Companion.CREDENTIALS_CHANGED
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnection
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManagerListener
import software.aws.toolkits.jetbrains.core.credentials.pinning.CodeWhispererConnection
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.CodeWhispererExplorerActionManager
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants
import software.aws.toolkits.jetbrains.services.codewhisperer.util.transform
import kotlin.reflect.KProperty0
import kotlin.reflect.jvm.isAccessible

// TODO: move this file to package "/client"
// As the connection is project-level, we need to make this project-level too
interface CodeWhispererClientAdaptor : Disposable {
    val project: Project

    fun generateCompletionsPaginator(
        firstRequest: GenerateCompletionsRequest,
    ): Sequence<GenerateCompletionsResponse>

    fun createUploadUrl(
        request: CreateUploadUrlRequest
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

open class CodeWhispererClientAdaptorImpl(override val project: Project) : CodeWhispererClientAdaptor {
    private val mySigv4Client by lazy { createUnmanagedSigv4Client() }

    @Volatile private var myBearerClient: CodeWhispererRuntimeClient? = null

    private val KProperty0<*>.isLazyInitialized: Boolean
        get() {
            isAccessible = true
            return (getDelegate() as Lazy<*>).isInitialized()
        }

    init {
        initClientUpdateListener()
    }

    private fun initClientUpdateListener() {
        ApplicationManager.getApplication().messageBus.connect(this).subscribe(
            ToolkitConnectionManagerListener.TOPIC,
            object : ToolkitConnectionManagerListener {
                override fun activeConnectionChanged(newConnection: ToolkitConnection?) {
                    if (newConnection is AwsBearerTokenConnection) {
                        myBearerClient = getBearerClient(newConnection.getConnectionSettings().providerId)
                    }
                }
            }
        )
    }

    private fun bearerClient(): CodeWhispererRuntimeClient {
        if (myBearerClient != null) return myBearerClient as CodeWhispererRuntimeClient
        myBearerClient = getBearerClient()
        return myBearerClient as CodeWhispererRuntimeClient
    }

    override fun generateCompletionsPaginator(firstRequest: GenerateCompletionsRequest) = sequence<GenerateCompletionsResponse> {
        var nextToken: String? = firstRequest.nextToken()
        do {
            val response = bearerClient().generateCompletions(firstRequest.copy { it.nextToken(nextToken) })
            nextToken = response.nextToken()
            yield(response)
        } while (!nextToken.isNullOrEmpty())
    }

    override fun createUploadUrl(request: CreateUploadUrlRequest): CreateUploadUrlResponse =
        bearerClient().createUploadUrl(request)

    override fun createCodeScan(request: CreateCodeScanRequest, isSigv4: Boolean): CreateCodeScanResponse =
        if (isSigv4) {
            mySigv4Client.createCodeScan(request)
        } else {
            bearerClient().startCodeAnalysis(request.transform()).transform()
        }

    override fun getCodeScan(request: GetCodeScanRequest, isSigv4: Boolean): GetCodeScanResponse =
        if (isSigv4) {
            mySigv4Client.getCodeScan(request)
        } else {
            bearerClient().getCodeAnalysis(request.transform()).transform()
        }

    override fun listCodeScanFindings(request: ListCodeScanFindingsRequest, isSigv4: Boolean): ListCodeScanFindingsResponse =
        if (isSigv4) {
            mySigv4Client.listCodeScanFindings(request)
        } else {
            bearerClient().listCodeAnalysisFindings(request.transform()).transform()
        }

    override fun dispose() {
        if (this::mySigv4Client.isLazyInitialized) {
            mySigv4Client.close()
        }
        myBearerClient?.close()
    }

    /**
     * Every different SSO/AWS Builder ID connection requires a new client which has its corresponding bearer token provider,
     * thus we have to create them dynamically.
     * Invalidate and recycle the old client first, and create a new client with the new connection.
     * This makes sure when we invoke CW, we always use the up-to-date connection.
     * In case this fails to close the client, myBearerClient is already set to null thus next time when we invoke CW,
     * it will go through this again which should get the current up-to-date connection. This stale client would be
     * unused and stay in memory for a while until eventually closed by ToolkitClientManager.
     */
    open fun getBearerClient(oldProviderIdToRemove: String = ""): CodeWhispererRuntimeClient {
        myBearerClient = null
        ApplicationManager.getApplication().messageBus.syncPublisher(CREDENTIALS_CHANGED)
            .providerRemoved(oldProviderIdToRemove)

        val connection = ToolkitConnectionManager.getInstance(project).activeConnectionForFeature(CodeWhispererConnection.getInstance())
        connection as? AwsBearerTokenConnection ?: error("$connection is not a bearer token connection")
        return AwsClientManager.getInstance().getClient<CodeWhispererRuntimeClient>(connection.getConnectionSettings())
    }

    companion object {
        private fun createUnmanagedSigv4Client(): CodeWhispererClient = AwsClientManager.getInstance().createUnmanagedClient(
            AnonymousCredentialsProvider.create(),
            CodeWhispererConstants.Config.Sigv4ClientRegion,
            CodeWhispererConstants.Config.CODEWHISPERER_ENDPOINT
        )
    }
}

class MockCodeWhispererClientAdaptor(override val project: Project) : CodeWhispererClientAdaptorImpl(project) {
    override fun getBearerClient(oldProviderIdToRemove: String): CodeWhispererRuntimeClient = project.awsClient()

    override fun dispose() {}
}
