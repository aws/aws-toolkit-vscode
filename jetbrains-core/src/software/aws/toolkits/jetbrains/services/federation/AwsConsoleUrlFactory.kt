// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.federation

import com.fasterxml.jackson.annotation.JsonProperty
import com.fasterxml.jackson.databind.DeserializationFeature
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import org.apache.http.client.entity.UrlEncodedFormEntity
import org.apache.http.client.methods.HttpPost
import org.apache.http.impl.client.HttpClientBuilder
import org.apache.http.message.BasicNameValuePair
import software.amazon.awssdk.auth.credentials.AwsCredentials
import software.amazon.awssdk.auth.credentials.AwsCredentialsProvider
import software.amazon.awssdk.auth.credentials.AwsSessionCredentials
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.sts.StsClient
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.jetbrains.core.AwsClientManager
import java.time.Duration

class AwsConsoleUrlFactory(
    private val httpClientBuilder: HttpClientBuilder = HttpClientBuilder.create()
) {
    fun federationUrl(region: AwsRegion): String {
        // https://docs.aws.amazon.com/general/latest/gr/signin-service.html
        // https://docs.amazonaws.cn/en_us/aws/latest/userguide/endpoints-Beijing.html
        // TODO: pull this into our endpoints generator somehow

        val signinTld = when (region.partitionId) {
            // special case cn since signin.amazonaws.com.cn does not resolve
            "aws-cn" -> "signin.amazonaws.cn"
            else -> "signin.${consoleTld(region)}"
        }

        val subdomain = when (region.id) {
            "us-east-1", "us-gov-west-1", "cn-north-1" -> ""
            else -> "${region.id}."
        }

        return "https://$subdomain$signinTld/federation"
    }

    fun consoleTld(region: AwsRegion) = when (region.partitionId) {
        // needs to be these; for example, redirecting to "amazonaws.com" is not allowed
        "aws" -> {
            "aws.amazon.com"
        }
        // TODO: gov is not supported for POST-based federation yet
//        "aws-us-gov" -> {
//            "amazonaws-us-gov.com"
//        }
        "aws-cn" -> {
            "amazonaws.com.cn"
        }
        else -> throw IllegalStateException("Partition '${region.partitionId}' is not supported")
    }

    fun consoleUrl(fragment: String? = null, region: AwsRegion): String {
        val consoleHome = "https://${region.id}.console.${consoleTld(region)}"

        return "$consoleHome${fragment ?: "/"}"
    }

    fun getSigninToken(credentials: AwsCredentials, region: AwsRegion): String {
        val creds = if (credentials !is AwsSessionCredentials) {
            val stsClient: StsClient = AwsClientManager.getInstance()
                .createUnmanagedClient(AwsCredentialsProvider { credentials }, Region.of(region.id))

            val tokenResponse = stsClient.use { client ->
                client.getFederationToken {
                    it.durationSeconds(Duration.ofMinutes(15).toSeconds().toInt())
                    it.name("FederationViaAWSJetBrainsToolkit")
                }
            }

            tokenResponse.credentials().let { AwsSessionCredentials.create(it.accessKeyId(), it.secretAccessKey(), it.sessionToken()) }
        } else {
            credentials
        }

        val sessionJson = mapper.writeValueAsString(
            GetSigninTokenRequest(
                sessionId = creds.accessKeyId(),
                sessionKey = creds.secretAccessKey(),
                sessionToken = creds.sessionToken()
            )
        )

        val params = mapOf(
            "Action" to "getSigninToken",
            "SessionType" to "json",
            "Session" to sessionJson
        ).map { BasicNameValuePair(it.key, it.value) }

        val request = HttpPost(federationUrl(region))
            .apply {
                entity = UrlEncodedFormEntity(params)
            }

        val result = httpClientBuilder
            .setUserAgent(AwsClientManager.userAgent)
            .build().use { c ->
                c.execute(
                    request
                ).use { resp ->
                    resp.entity.content.readAllBytes().decodeToString()
                }
            }

        return mapper.readValue<GetSigninTokenResponse>(result).signinToken
    }

    private fun getSigninUrl(token: String, destination: String? = null, region: AwsRegion): String {
        val params = mapOf(
            "Action" to "login",
            "SigninToken" to token,
            "Destination" to consoleUrl(fragment = destination, region = region)
        ).map { BasicNameValuePair(it.key, it.value) }

        return "${federationUrl(region)}?${UrlEncodedFormEntity(params).toUrlEncodedString()}"
    }

    fun getSigninUrl(credentials: AwsCredentials, destination: String?, region: AwsRegion): String {
        return getSigninUrl(getSigninToken(credentials, region), destination, region)
    }

    private val mapper = jacksonObjectMapper().disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
}

private data class GetSigninTokenRequest(
    @JsonProperty("sessionId")
    val sessionId: String,
    @JsonProperty("sessionKey")
    val sessionKey: String,
    @JsonProperty("sessionToken")
    val sessionToken: String
)

private data class GetSigninTokenResponse(
    @JsonProperty("SigninToken")
    val signinToken: String
)

private fun UrlEncodedFormEntity.toUrlEncodedString() = this.content.bufferedReader().readText()
