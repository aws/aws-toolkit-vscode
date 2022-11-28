// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer
//
// import com.intellij.openapi.application.ApplicationManager
// import com.intellij.testFramework.ApplicationRule
// import com.intellij.testFramework.DisposableRule
// import com.intellij.testFramework.RuleChain
// import com.intellij.testFramework.replaceService
// import org.assertj.core.api.Assertions.assertThat
// import org.junit.Before
// import org.junit.Rule
// import org.junit.Test
// import org.junit.jupiter.api.assertThrows
// import org.mockito.Mockito.mockConstruction
// import org.mockito.kotlin.doReturn
// import org.mockito.kotlin.doThrow
// import org.mockito.kotlin.mock
// import org.mockito.kotlin.stub
// import org.mockito.kotlin.verify
// import org.mockito.kotlin.verifyNoMoreInteractions
// import org.mockito.kotlin.whenever
// import software.aws.toolkits.core.ConnectionSettings
// import software.aws.toolkits.core.TokenConnectionSettings
// import software.aws.toolkits.core.utils.test.aString
// import software.aws.toolkits.jetbrains.core.credentials.sso.bearer.BearerTokenAuthState
// import software.aws.toolkits.jetbrains.core.credentials.sso.bearer.BearerTokenProvider
// import software.aws.toolkits.jetbrains.core.credentials.sso.bearer.InteractiveBearerTokenProvider
// import software.aws.toolkits.jetbrains.services.codewhisperer.credentials.AccountlessCredentialIdentifier
// import software.aws.toolkits.jetbrains.services.codewhisperer.credentials.CodeWhispererCredentialManager
// import software.aws.toolkits.jetbrains.services.codewhisperer.credentials.CodeWhispererLoginType
// import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.CodeWhispererExplorerActionManager
// import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants
// import java.util.concurrent.atomic.AtomicReference
// import kotlin.test.fail
//
// class CodeWhispererCredentialManagerTest {
//    val applicationRule = ApplicationRule()
//    val disposableRule = DisposableRule()
//
//    @Rule
//    @JvmField
//    val ruleChain = RuleChain(applicationRule, disposableRule)
//
//    private lateinit var explorerActionManager: CodeWhispererExplorerActionManager
//    private lateinit var credentialProvider: BearerTokenProvider
//    lateinit var sut: CodeWhispererCredentialManager
//    private val providerId = aString()
//
//    @Before
//    fun setup() {
//        explorerActionManager = mock()
//        credentialProvider = mock<BearerTokenProvider>().apply {
//            whenever(id).thenReturn(providerId)
//        }
//        ApplicationManager.getApplication().replaceService(CodeWhispererExplorerActionManager::class.java, explorerActionManager, disposableRule.disposable)
//    }
//
//    @Test
//    fun `when url equals Sono url should return Sono`() {
//        val credentialProvider: BearerTokenProvider = mock {
//            on { id } doReturn CodeWhispererConstants.CredentialConfig.SonoUrl
//        }
//        sut = CodeWhispererCredentialManager(AtomicReference(credentialProvider))
//        assertThat(sut.loginType).isEqualTo(CodeWhispererLoginType.Sono)
//    }
//
//    @Test
//    fun `when url not equals Sono url should return Sso`() {
//        val credentialProvider: BearerTokenProvider = mock {
//            on { id } doReturn "https://foo.com/start"
//        }
//        sut = CodeWhispererCredentialManager(AtomicReference(credentialProvider))
//        assertThat(sut.loginType).isEqualTo(CodeWhispererLoginType.SSO)
//    }
//
//    @Test
//    fun `when no active bearer credential && has accept cwspr TOS should return accountless`() {
//        explorerActionManager.stub {
//            on { hasAcceptedTermsOfService() } doReturn true
//        }
//        sut = CodeWhispererCredentialManager()
//        assertThat(sut.loginType).isEqualTo(CodeWhispererLoginType.Accountless)
//    }
//
//    @Test
//    fun `when no active provider && not tos not accepted should return Logout`() {
//        explorerActionManager.stub {
//            on { hasAcceptedTermsOfService() } doReturn false
//        }
//        sut = CodeWhispererCredentialManager()
//        assertThat(sut.loginType).isEqualTo(CodeWhispererLoginType.Logout)
//    }
//
//    @Test
//    fun `connectionsSettings - bearer should return TokneConnectionSettings`() {
//        sut = CodeWhispererCredentialManager(AtomicReference(credentialProvider))
//        val actual = sut.connectionSettings() as? TokenConnectionSettings ?: fail("Casting should have succeeded")
//
//        assertThat(actual.providerId).isEqualTo(providerId)
//    }
//
//    @Test
//    fun `connectionsSettings - logout should throw RuntimeException`() {
//        explorerActionManager.stub {
//            on { hasAcceptedTermsOfService() } doReturn false
//        }
//        sut = CodeWhispererCredentialManager()
//        assertThrows<RuntimeException> { sut.connectionSettings() }
//    }
//
//    @Test
//    fun `connectionSettings - accountless should return ConnectionSettings`() {
//        whenever(explorerActionManager.hasAcceptedTermsOfService()).thenReturn(true)
//        sut = CodeWhispererCredentialManager()
//        // when current tokenProvider isNull && hasAcceptCwTos -> accountless user
//        assertThat(sut.getCurrentProvider()).isNull()
//        assertThat(CodeWhispererExplorerActionManager.getInstance().hasAcceptedTermsOfService()).isTrue
//        val actual = sut.connectionSettings() as? ConnectionSettings ?: fail("Casting should have succeeded")
//
//        assertThat(actual.credentials.identifier).isSameAs(AccountlessCredentialIdentifier)
//    }
//
// //    @Test
// //    fun `logout should set current credential provider null when there is an active credential provider`() {
// //        val cachedProviders = mutableMapOf<String, BearerTokenProvider>(mock(), mock(), mock())
// //        sut = CodeWhispererCredentialManager(AtomicReference(credentialProvider), cachedProviders)
// //
// //        sut.logout()
// //        assertThat(sut.getCurrentProvider()).isNull()
// //    }
// //
// //    @Test
// //    fun `logout when there is 0 credential provider`() {
// //        val cachedProviders = mutableMapOf<String, BearerTokenProvider>(mock(), mock(), mock())
// //        sut = CodeWhispererCredentialManager(providers = cachedProviders)
// //
// //        sut.logout()
// //        assertThat(sut.getCurrentProvider()).isNull()
// //    }
//
//    /**
//     * isLogin return true iff current tokenProvider isNotNull && the state of it is Authorized
//     */
//    @Test
//    fun `isLogin`() {
//        // current tokenProvider == null
//        sut = CodeWhispererCredentialManager()
//        assertThat(sut.isLogin()).isFalse
//
//        // current tokenProvider != null, but state is NOT_AUTHENTICATED
//        whenever(credentialProvider.state()).thenReturn(BearerTokenAuthState.NOT_AUTHENTICATED)
//        sut = CodeWhispererCredentialManager(AtomicReference(credentialProvider))
//        assertThat(sut.isLogin()).isFalse
//
//        // current tokenProvider != null, but state is NEEDS_REFRESH
//        whenever(credentialProvider.state()).thenReturn(BearerTokenAuthState.NEEDS_REFRESH)
//        sut = CodeWhispererCredentialManager(AtomicReference(credentialProvider))
//        assertThat(sut.isLogin()).isFalse
//
//        whenever(credentialProvider.state()).thenReturn(BearerTokenAuthState.AUTHORIZED)
//        sut = CodeWhispererCredentialManager(AtomicReference(credentialProvider))
//        assertThat(sut.isLogin()).isTrue
//    }
// //
// //    @Test
// //    fun `test re-login (when there is a cached token provider) successfully for cases`() {
// //        testReLoginSucceedUtil(BearerTokenAuthState.AUTHORIZED)
// //        testReLoginSucceedUtil(BearerTokenAuthState.NOT_AUTHENTICATED)
// //        testReLoginSucceedUtil(BearerTokenAuthState.NEEDS_REFRESH)
// //    }
// //
// //    @Test
// //    fun `test re-login (when there is a cached token provider) but exception thrown`() {
// //        testReLoginFailedUtil(BearerTokenAuthState.NOT_AUTHENTICATED)
// //        testReLoginFailedUtil(BearerTokenAuthState.NEEDS_REFRESH)
// //    }
//
// //    @Test
// //    fun `test new login (when there is no existing token provider) succeed`() {
// //        sut = CodeWhispererCredentialManager()
// //
// //        mockConstruction(InteractiveBearerTokenProvider::class.java) { _, _ -> }.use {
// //            assertThat(sut.getProviders()).hasSize(0)
// //            assertThat(sut.getCurrentProvider()).isNull()
// //
// //            sut.login("url0")
// //
// //            assertThat(it.constructed()).hasSize(1) // constrctor is called because there is no corresponding provider found in the map
// //            val newlyCreatedProvider = it.constructed()[0]
// //            assertThat(sut.getCurrentProvider()).isSameAs(newlyCreatedProvider) // login succeed -> set current provider
// //            assertThat(sut.getProviders()["url0"]) // login succeed -> add this provider into the map
// //                .isNotNull
// //                .isSameAs(newlyCreatedProvider)
// //            verify(newlyCreatedProvider).reauthenticate()
// //        }
// //    }
// //
// //    @Test
// //    fun `test new login (when there is no existing token provider) fail`() {
// //        sut = CodeWhispererCredentialManager()
// //
// //        mockConstruction(InteractiveBearerTokenProvider::class.java) { context, setting ->
// //            setting.stub {
// //                on { context.reauthenticate() } doThrow RuntimeException()
// //            }
// //        }.use {
// //            assertThat(sut.getProviders()).hasSize(0)
// //            assertThat(sut.getCurrentProvider()).isNull()
// //
// //            try {
// //                sut.login("url0")
// //                fail("Call should have thrown exception, should not be here")
// //            } catch (_: Exception) {}
// //
// //            assertThat(it.constructed()).hasSize(1) // constrctor is called because there is no corresponding provider found in the map
// //            val newlyCreatedProvider = it.constructed()[0]
// //            assertThat(sut.getCurrentProvider()).isNull() // login fail -> not update
// //            assertThat(sut.getProviders()).hasSize(0) // login fail -> not update
// //            verify(newlyCreatedProvider).reauthenticate()
// //        }
// //    }
// //
// //    private fun testReLoginSucceedUtil(authState: BearerTokenAuthState) {
// //        val user0: BearerTokenProvider = mock {
// //            on { state() } doReturn authState
// //        }
// //        val cachedProviders = mutableMapOf<String, BearerTokenProvider>("url0" to user0, "url1" to mock())
// //        sut = CodeWhispererCredentialManager(providers = cachedProviders)
// //
// //        // before
// //        assertThat(sut.getProviders()).hasSize(2)
// //        assertThat(sut.getCurrentProvider()).isNull()
// //
// //        sut.login("url0")
// //
// //        // after
// //        assertThat(sut.getProviders()).hasSize(2)
// //        assertThat(sut.getCurrentProvider()).isSameAs(user0)
// //        verify(user0).state()
// //        when (authState) {
// //            BearerTokenAuthState.AUTHORIZED -> run { verifyNoMoreInteractions(user0) }
// //            BearerTokenAuthState.NOT_AUTHENTICATED -> run { verify(user0).reauthenticate() }
// //            BearerTokenAuthState.NEEDS_REFRESH -> run { verify(user0).resolveToken() }
// //        }
// //    }
// //
// //    private fun testReLoginFailedUtil(authState: BearerTokenAuthState) {
// //        val user0: BearerTokenProvider = mock {
// //            on { state() } doReturn authState
// //            on { reauthenticate() } doThrow RuntimeException()
// //            on { resolveToken() } doThrow RuntimeException()
// //        }
// //
// //        sut = CodeWhispererCredentialManager(providers = mutableMapOf("url0" to user0))
// //
// //        // before
// //        assertThat(sut.getProviders()).hasSize(1)
// //        assertThat(sut.getCurrentProvider()).isNull()
// //
// //        try {
// //            sut.login("url0")
// //            fail("Call should have thrown exception, should not be here")
// //        } catch (_: Exception) {}
// //
// //        // after
// //        assertThat(sut.getProviders()).hasSize(1)
// //        assertThat(sut.getCurrentProvider()).isNull()
// //
// //        verify(user0).state()
// //        when (authState) {
// //            BearerTokenAuthState.NOT_AUTHENTICATED -> run { verify(user0).reauthenticate() }
// //            BearerTokenAuthState.NEEDS_REFRESH -> run { verify(user0).resolveToken() }
// //            else -> error("authorized should never happen on this path")
// //        }
// //    }
// }
