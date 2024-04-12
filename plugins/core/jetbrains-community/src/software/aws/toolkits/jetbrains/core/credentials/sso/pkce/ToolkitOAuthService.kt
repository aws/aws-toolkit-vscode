// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.sso.pkce

import com.intellij.collaboration.auth.OAuthCallbackHandlerBase
import com.intellij.collaboration.auth.services.OAuthCredentialsAcquirer
import com.intellij.collaboration.auth.services.OAuthRequest
import com.intellij.collaboration.auth.services.OAuthServiceBase
import com.intellij.collaboration.auth.services.PkceUtils
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.wm.IdeFocusManager
import com.intellij.util.Url
import com.intellij.util.Urls.newFromEncoded
import com.intellij.util.io.DigestUtil
import io.netty.handler.codec.http.FullHttpRequest
import org.jetbrains.ide.BuiltInServerManager
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.ssooidc.endpoints.SsoOidcEndpointParams
import software.amazon.awssdk.services.ssooidc.endpoints.internal.DefaultSsoOidcEndpointProvider
import software.aws.toolkits.jetbrains.core.credentials.sso.AccessToken
import software.aws.toolkits.jetbrains.core.credentials.sso.PKCEAuthorizationGrantToken
import software.aws.toolkits.jetbrains.core.credentials.sso.PKCEClientRegistration
import software.aws.toolkits.jetbrains.core.credentials.sso.bearer.buildUnmanagedSsoOidcClient
import java.math.BigInteger
import java.time.Instant
import java.util.Base64
import java.util.concurrent.CompletableFuture

@Service
class ToolkitOAuthService : OAuthServiceBase<AccessToken>() {
    override val name: String = "aws/toolkit"

    fun hasPendingRequest() = currentRequest.get() != null

    fun authorize(registration: PKCEClientRegistration): CompletableFuture<AccessToken> {
        val currentRequest = currentRequest.get()
        val toolkitRequest = currentRequest?.request as? ToolkitOAuthRequest

        if (toolkitRequest != null) {
            check(toolkitRequest.registration == registration) {
                """
                    Attempting to start a new authorization with a different client registration while one is pending
                    Current: ${toolkitRequest.registration}
                    New: $registration
                """.trimIndent()
            }
        }

        return authorize(ToolkitOAuthRequest(registration))
    }

    override fun handleServerCallback(path: String, parameters: Map<String, List<String>>): Boolean {
        val request = currentRequest.get() ?: return false
        val toolkitRequest = request.request as? ToolkitOAuthRequest ?: return false

        val callbackState = parameters["state"]?.firstOrNull()
        if (toolkitRequest.csrfToken != callbackState) {
            request.result.completeExceptionally(RuntimeException("Invalid CSRF token"))
            return false
        }

        return super.handleServerCallback(path, parameters)
    }

    override fun revokeToken(token: String) {
        TODO("Not yet implemented")
    }

    companion object {
        fun getInstance() = service<ToolkitOAuthService>()
    }
}

private class ToolkitOAuthRequest(internal val registration: PKCEClientRegistration) : OAuthRequest<AccessToken> {
    private val port: Int get() = BuiltInServerManager.getInstance().port
    private val base64Encoder = Base64.getUrlEncoder().withoutPadding()

    // 160 bits of entropy, per https://datatracker.ietf.org/doc/html/rfc6749#section-10.10
    internal val csrfToken = randB64url(160)

    // 256 bits of entropy, per https://datatracker.ietf.org/doc/html/rfc7636#section-7.1
    private val codeVerifier = randB64url(256)

    private val codeChallenge = PkceUtils.generateShaCodeChallenge(codeVerifier, base64Encoder)

    override val authorizationCodeUrl: Url
        get() = newFromEncoded("http://127.0.0.1:$port/oauth/callback")

    val redirectUri
        get() = authorizationCodeUrl.toExternalForm()

    private val serviceUri
        get() = DefaultSsoOidcEndpointProvider().resolveEndpoint(SsoOidcEndpointParams.builder().region(Region.of(registration.region)).build()).get()

    override val credentialsAcquirer: OAuthCredentialsAcquirer<AccessToken> = ToolkitOauthCredentialsAcquirer(registration, codeVerifier, redirectUri)

    override val authUrlWithParameters: Url
        get() = newFromEncoded(serviceUri.url().resolve("authorize").toString()).addParameters(
            mapOf(
                "response_type" to "code",
                "client_id" to registration.clientId,
                "redirect_uri" to redirectUri,
                "scopes" to registration.scopes.sorted().joinToString(" "),
                "state" to csrfToken,
                "code_challenge" to codeChallenge,
                "code_challenge_method" to "S256"
            )
        )

    private fun randB64url(bits: Int): String = base64Encoder.encodeToString(BigInteger(bits, DigestUtil.random).toByteArray())
}

// exchange for real token
internal class ToolkitOauthCredentialsAcquirer(
    private val registration: PKCEClientRegistration,
    private val codeVerifier: String,
    private val redirectUri: String,
) : OAuthCredentialsAcquirer<AccessToken> {
    override fun acquireCredentials(code: String): OAuthCredentialsAcquirer.AcquireCredentialsResult<AccessToken> {
        val token = buildUnmanagedSsoOidcClient(registration.region).use { client ->
            client.createToken {
                it.clientId(registration.clientId)
                it.clientSecret(registration.clientSecret)
                it.grantType("authorization_code")
                it.redirectUri(redirectUri)
                it.codeVerifier(codeVerifier)
                it.code(code)
            }
        }

        return OAuthCredentialsAcquirer.AcquireCredentialsResult.Success(
            PKCEAuthorizationGrantToken(
                issuerUrl = registration.issuerUrl,
                region = registration.region,
                accessToken = token.accessToken(),
                refreshToken = token.refreshToken(),
                expiresAt = Instant.now().plusSeconds(token.expiresIn().toLong()),
                createdAt = Instant.now()
            )
        )
    }
}

internal class ToolkitOAuthCallbackHandler : OAuthCallbackHandlerBase() {
    override fun oauthService() = ToolkitOAuthService.getInstance()

    // on success / fail
    override fun handleAcceptCode(isAccepted: Boolean): AcceptCodeHandleResult {
        // focus should be on requesting component?
        runInEdt {
            IdeFocusManager.getGlobalInstance().getLastFocusedIdeWindow()?.toFront()
        }

        // provide a better page
        return AcceptCodeHandleResult.Page(if (isAccepted) "complete" else "error")
    }

    override fun isSupported(request: FullHttpRequest): Boolean {
        // only handle if we're actively waiting on a redirect
        if (!oauthService().hasPendingRequest()) {
            return false
        }

        // only handle the /oauth/callback endpoint
        return request.uri().trim('/').startsWith("oauth/callback")
    }
}
