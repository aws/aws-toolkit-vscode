// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.util

import com.intellij.openapi.application.ApplicationManager
import software.amazon.awssdk.auth.credentials.AnonymousCredentialsProvider
import software.amazon.awssdk.auth.credentials.AwsCredentialsProvider
import software.amazon.awssdk.auth.token.credentials.SdkTokenProvider
import software.amazon.awssdk.awscore.client.builder.AwsClientBuilder
import software.amazon.awssdk.core.client.config.ClientOverrideConfiguration
import software.amazon.awssdk.core.interceptor.Context
import software.amazon.awssdk.core.interceptor.ExecutionAttributes
import software.amazon.awssdk.core.interceptor.ExecutionInterceptor
import software.amazon.awssdk.core.retry.RetryPolicy
import software.amazon.awssdk.http.SdkHttpRequest
import software.amazon.awssdk.services.codewhisperer.CodeWhispererClientBuilder
import software.amazon.awssdk.services.codewhispererruntime.CodeWhispererRuntimeClientBuilder
import software.amazon.awssdk.services.codewhispererstreaming.CodeWhispererStreamingAsyncClientBuilder
import software.amazon.awssdk.services.cognitoidentity.CognitoIdentityClient
import software.aws.toolkits.core.ToolkitClientCustomizer
import software.aws.toolkits.jetbrains.core.AwsSdkClient
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.CodeWhispererExplorerActionManager
import software.aws.toolkits.jetbrains.services.codewhisperer.settings.CodeWhispererSettings
import software.aws.toolkits.jetbrains.services.telemetry.AwsCognitoCredentialsProvider
import java.net.URI

// TODO: move this file to package /client
class CodeWhispererEndpointCustomizer : ToolkitClientCustomizer {

    override fun customize(
        credentialProvider: AwsCredentialsProvider?,
        tokenProvider: SdkTokenProvider?,
        regionId: String,
        builder: AwsClientBuilder<*, *>,
        clientOverrideConfiguration: ClientOverrideConfiguration.Builder
    ) {
        if (builder is CodeWhispererRuntimeClientBuilder || builder is CodeWhispererStreamingAsyncClientBuilder) {
            builder
                .endpointOverride(URI.create(CodeWhispererConstants.Config.CODEWHISPERER_ENDPOINT))
                .region(CodeWhispererConstants.Config.BearerClientRegion)
            clientOverrideConfiguration.retryPolicy(RetryPolicy.none())
            clientOverrideConfiguration.addExecutionInterceptor(
                object : ExecutionInterceptor {
                    override fun modifyHttpRequest(context: Context.ModifyHttpRequest, executionAttributes: ExecutionAttributes): SdkHttpRequest {
                        val requestBuilder = context.httpRequest().toBuilder()
                        executionAttributes.attributes.forEach { (k, v) ->
                            if (k.toString() != "OperationName") return@forEach
                            val isMetricOptIn = CodeWhispererSettings.getInstance().isMetricOptIn()
                            if (v == "GenerateCompletions") {
                                requestBuilder.putHeader(OPTOUT_KEY_NAME, (!isMetricOptIn).toString())
                            }
                            return requestBuilder.build()
                        }
                        return context.httpRequest()
                    }
                }
            )
        } else if (builder is CodeWhispererClientBuilder) {
            clientOverrideConfiguration.addExecutionInterceptor(
                object : ExecutionInterceptor {
                    override fun modifyHttpRequest(context: Context.ModifyHttpRequest, executionAttributes: ExecutionAttributes): SdkHttpRequest {
                        val requestBuilder = context.httpRequest().toBuilder()
                        executionAttributes.attributes.forEach { (k, v) ->
                            if (k.toString() != "OperationName") return@forEach
                            if (v == "GetAccessToken") return requestBuilder.build()
                            val token = CodeWhispererExplorerActionManager.getInstance().resolveAccessToken() ?: return requestBuilder.build()
                            requestBuilder.putHeader(TOKEN_KEY_NAME, token)

                            val isMetricOptIn = CodeWhispererSettings.getInstance().isMetricOptIn()
                            if (v == "ListRecommendations") {
                                requestBuilder.putHeader(OPTOUT_KEY_NAME, (!isMetricOptIn).toString())
                            }
                            return requestBuilder.build()
                        }
                        return context.httpRequest()
                    }
                }
            )

            builder
                .region(CodeWhispererConstants.Config.Sigv4ClientRegion)

            if (!ApplicationManager.getApplication().isUnitTestMode) {
                builder
                    .credentialsProvider(
                        AwsCognitoCredentialsProvider(
                            CodeWhispererConstants.Config.CODEWHISPERER_IDPOOL_ID,
                            CognitoIdentityClient.builder()
                                .credentialsProvider(AnonymousCredentialsProvider.create())
                                .region(CodeWhispererConstants.Config.Sigv4ClientRegion)
                                .httpClient(AwsSdkClient.getInstance().sharedSdkClient())
                                .build()
                        )
                    )
            }
        }
    }

    companion object {
        internal const val TOKEN_KEY_NAME = "x-amzn-codewhisperer-token"
        internal const val OPTOUT_KEY_NAME = "x-amzn-codewhisperer-optout"
    }
}
