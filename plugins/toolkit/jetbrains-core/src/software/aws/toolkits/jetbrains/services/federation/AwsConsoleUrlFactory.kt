// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.federation

import com.fasterxml.jackson.annotation.JsonProperty
import com.fasterxml.jackson.databind.DeserializationFeature
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import com.intellij.ide.BrowserUtil
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
import org.apache.http.client.entity.UrlEncodedFormEntity
import org.apache.http.client.methods.HttpPost
import org.apache.http.impl.client.HttpClientBuilder
import org.apache.http.message.BasicNameValuePair
import software.amazon.awssdk.auth.credentials.AwsSessionCredentials
import software.amazon.awssdk.services.sts.StsClient
import software.aws.toolkits.core.ConnectionSettings
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.core.AwsClientManager
import software.aws.toolkits.jetbrains.core.credentials.getConnectionSettings
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.jetbrains.utils.notifyNoActiveCredentialsError
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.DeeplinkTelemetry
import software.aws.toolkits.telemetry.Result
import java.net.URLEncoder
import java.time.Duration

object AwsConsoleUrlFactory {
    private val defaultHttpClientBuilder: HttpClientBuilder by lazy { HttpClientBuilder.create() }

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

    fun getSigninUrl(connectionSettings: ConnectionSettings, destination: String?, httpClientBuilder: HttpClientBuilder = defaultHttpClientBuilder): String =
        getSigninUrl(getSigninToken(connectionSettings, httpClientBuilder), destination, connectionSettings.region)

    fun getSigninToken(connectionSettings: ConnectionSettings, httpClientBuilder: HttpClientBuilder = defaultHttpClientBuilder): String {
        val resolvedCreds = connectionSettings.credentials.resolveCredentials()
        val sessionCredentials = if (resolvedCreds !is AwsSessionCredentials) {
            val stsClient = AwsClientManager.getInstance().getClient<StsClient>(connectionSettings)

            val tokenResponse = stsClient.use { client ->
                client.getFederationToken {
                    it.durationSeconds(Duration.ofMinutes(15).toSeconds().toInt())
                    it.name("FederationViaAWSJetBrainsToolkit")
                    // policy is required otherwise resulting session has no permissions
                    // session will have the intersection of role permissions and this policy
                    it.policyArns({ builder ->
                        builder.arn("arn:aws:iam::aws:policy/AdministratorAccess")
                    })
                }
            }

            tokenResponse.credentials().let { AwsSessionCredentials.create(it.accessKeyId(), it.secretAccessKey(), it.sessionToken()) }
        } else {
            resolvedCreds
        }

        val sessionJson = mapper.writeValueAsString(
            GetSigninTokenRequest(
                sessionId = sessionCredentials.accessKeyId(),
                sessionKey = sessionCredentials.secretAccessKey(),
                sessionToken = sessionCredentials.sessionToken()
            )
        )

        val params = mapOf(
            "Action" to "getSigninToken",
            "SessionType" to "json",
            "Session" to sessionJson
        ).map { BasicNameValuePair(it.key, it.value) }

        val request = HttpPost(federationUrl(connectionSettings.region))
            .apply {
                entity = UrlEncodedFormEntity(params)
            }

        val result = httpClientBuilder
            .setUserAgent(AwsClientManager.getUserAgent())
            .build().use { c ->
                c.execute(
                    request
                ).use { resp ->
                    if (resp.statusLine.statusCode !in 200..399) {
                        throw RuntimeException("getSigninToken request to AWS Signin endpoint failed: ${resp.statusLine}")
                    }
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

    fun openArnInConsole(project: Project, place: String, arn: String) {
        val connectionSettings = project.getConnectionSettings()

        if (connectionSettings == null) {
            notifyNoActiveCredentialsError(project)
            return
        }

        ApplicationManager.getApplication().executeOnPooledThread {
            try {
                val encodedArn = URLEncoder.encode(arn, Charsets.UTF_8)
                val encodedUa = URLEncoder.encode(AwsClientManager.getUserAgent(), Charsets.UTF_8)
                val url = AwsConsoleUrlFactory.getSigninUrl(
                    connectionSettings,
                    "/go/view?arn=$encodedArn&source=$encodedUa"
                )
                BrowserUtil.browse(url)
                DeeplinkTelemetry.open(project, source = place, passive = false, result = Result.Succeeded)
            } catch (e: Exception) {
                val message = message("general.open_in_aws_console.error")
                notifyError(content = message, project = project)
                LOG.error(e) { message }
                DeeplinkTelemetry.open(project, source = place, passive = false, result = Result.Failed)
            }
        }
    }

    private val mapper = jacksonObjectMapper().disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
    private val LOG = getLogger<AwsConsoleUrlFactory>()
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
