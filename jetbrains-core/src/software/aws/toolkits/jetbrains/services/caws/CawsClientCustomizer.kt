// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.caws

import com.intellij.openapi.util.registry.Registry
import com.intellij.util.text.nullize
import software.amazon.awssdk.auth.credentials.AwsCredentialsProvider
import software.amazon.awssdk.auth.token.credentials.SdkTokenProvider
import software.amazon.awssdk.awscore.client.builder.AwsClientBuilder
import software.amazon.awssdk.core.client.config.ClientOverrideConfiguration
import software.amazon.awssdk.core.interceptor.Context
import software.amazon.awssdk.core.interceptor.ExecutionAttributes
import software.amazon.awssdk.core.interceptor.ExecutionInterceptor
import software.amazon.awssdk.services.codecatalyst.CodeCatalystClientBuilder
import software.amazon.awssdk.services.codecatalyst.model.CodeCatalystException
import software.aws.toolkits.core.ToolkitClientCustomizer
import software.aws.toolkits.core.utils.debug
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.tryOrNull
import software.aws.toolkits.core.utils.warn
import java.net.URI

class CawsClientCustomizer : ToolkitClientCustomizer {
    override fun customize(
        credentialProvider: AwsCredentialsProvider?,
        tokenProvider: SdkTokenProvider?,
        regionId: String,
        builder: AwsClientBuilder<*, *>,
        clientOverrideConfiguration: ClientOverrideConfiguration.Builder
    ) {
        if (builder is CodeCatalystClientBuilder) {
            val endpointOverride = Registry.get("aws.codecatalyst.endpoint").asString().nullize(true)
            if (endpointOverride != null) {
                tryOrNull {
                    val uri = URI.create(endpointOverride)
                    if (uri.scheme == null || uri.authority == null) {
                        null
                    } else {
                        uri
                    }
                }?.let {
                    builder.endpointOverride(it)
                }
            }

            clientOverrideConfiguration.addExecutionInterceptor(object : ExecutionInterceptor {
                override fun onExecutionFailure(context: Context.FailedExecution, executionAttributes: ExecutionAttributes) {
                    val exception = context.exception()
                    if (exception is CodeCatalystException) {
                        context.httpResponse().ifPresent { response ->
                            response.firstMatchingHeader("x-amzn-served-from").ifPresent {
                                LOG.warn { "Hit service exception. ${exception.requestId()} was served from $it" }
                            }

                            LOG.debug {
                                val headers = response.headers()
                                    .filter { header -> relevantHeaders.any { it.equals(header.key, ignoreCase = true) } }

                                "Additional headers for ${exception.requestId()}: $headers"
                            }
                        }
                    }
                }
            })
        }
    }

    companion object {
        private val LOG = getLogger<CawsClientCustomizer>()
        private val relevantHeaders = listOf(
            "x-amz-apigw-id",
            "x-amz-cf-id",
            "x-amz-cf-pop",
            "x-amzn-remapped-content-length",
            "x-amzn-remapped-x-amzn-requestid",
            "x-amzn-requestid",
            "x-amzn-served-from",
            "x-amzn-trace-id",
            "x-cache",
            "x-request-id"
        )
    }
}
