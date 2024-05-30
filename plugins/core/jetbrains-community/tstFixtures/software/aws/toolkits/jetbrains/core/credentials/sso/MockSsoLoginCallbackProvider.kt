// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.sso

import com.intellij.openapi.components.service
import org.junit.jupiter.api.Assumptions.assumeTrue
import software.amazon.awssdk.core.SdkBytes
import software.amazon.awssdk.services.lambda.LambdaClient
import software.amazon.awssdk.services.lambda.model.InvocationType
import software.amazon.awssdk.services.lambda.model.LambdaException
import software.aws.toolkits.core.clients.nullDefaultProfileFile
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.info
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.utils.scrubException

internal class MockSsoLoginCallbackProvider : SsoLoginCallbackProvider {
    internal var provider: SsoLoginCallback? = null
    private object ErrorSsoLoginCallback : SsoLoginCallback {
        override fun tokenPending(authorization: Authorization) {
            error("Not implemented")
        }

        override fun tokenRetrieved() {}

        override fun tokenRetrievalFailure(e: Exception) {}
    }

    override fun getProvider(isAlwaysShowDeviceCode: Boolean, ssoUrl: String): SsoLoginCallback =
        provider ?: ErrorSsoLoginCallback

    companion object {
        fun getInstance() = service<SsoLoginCallbackProvider>() as MockSsoLoginCallbackProvider
    }
}

object NoOpSsoLoginCallback : SsoLoginCallback {
    override fun tokenPending(authorization: Authorization) {}

    override fun tokenRetrieved() {}

    override fun tokenRetrievalFailure(e: Exception) {}
}

internal class TestSsoPrompt(private val secretName: String) : SsoLoginCallback {
    override fun tokenPending(authorization: Authorization) {
        val authLambda = System.getenv(authLambdaArn)
        assumeTrue(authLambda != null) {
            "Skipping test since $authLambdaArn wasn't set".also {
                LOG.warn { it }
            }
        }

        LOG.info { "Invoking login with authorization: $authorization" }

        // language=JSON
        val payload = """{
            |  "secret": "$secretName",
            |  "userCode": "${authorization.userCode}",
            |  "verificationUri": "${authorization.verificationUri}"
            |}
        """.trimMargin()

        val response = try {
            LambdaClient.builder()
                .overrideConfiguration {
                    if (!System.getenv("CI").isNullOrBlank()) {
                        it.nullDefaultProfileFile()
                    }
                }
                .build().use { client ->
                    client.invoke {
                        it.functionName(authLambda)
                        it.payload(SdkBytes.fromUtf8String(payload))
                        it.invocationType(InvocationType.REQUEST_RESPONSE)
                    }
                }
        } catch (e: LambdaException) {
            throw scrubException(e)
        }

        LOG.info {
            """
                "Auth invocation request ID: ${response.responseMetadata().requestId()}"
                "Auth function error: ${response.functionError()}
                "Auth invocation response status code: ${response.statusCode()}"
            """.trimIndent()
        }
    }

    override fun tokenRetrieved() {
        LOG.info { "Token successfully retrieved" }
    }

    override fun tokenRetrievalFailure(e: Exception) {
        LOG.error(e) { "Failed to retrieve token" }
    }

    private companion object {
        const val authLambdaArn = "AUTH_UTIL_LAMBDA_ARN"

        private val LOG = getLogger<TestSsoPrompt>()
    }
}
