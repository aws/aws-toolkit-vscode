// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core

import com.intellij.openapi.application.ApplicationManager
import com.intellij.testFramework.ProjectRule
import org.assertj.core.api.Assertions.assertThat
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials
import software.aws.toolkits.jetbrains.core.credentials.CredentialManager
import software.aws.toolkits.jetbrains.core.credentials.MockCredentialsManager
import software.aws.toolkits.jetbrains.utils.delegateMock

class AwsAccountCacheTest {

    @Rule
    @JvmField
    val projectRule = ProjectRule()

    private lateinit var mockCredentialManager: MockCredentialsManager

    @Before
    fun setUp() {
        mockCredentialManager = MockCredentialsManager.getInstance()
    }

    @After
    fun tearDown() {
        mockCredentialManager.reset()
    }

    @Test
    fun invalidCredentialProviderReturnsNull() {
        mockCredentialManager.addCredentials(
            "profile:foo",
            AwsBasicCredentials.create("Access", "Secret"),
            isValid = false
        )

        val accountCache = DefaultAwsAccountCache(delegateMock())
        assertThat(accountCache.awsAccount(mockCredentialManager.getCredentialProvider("profile:foo"))).isNull()
    }

    @Test
    fun validCredentialProviderReturnsCorrectAwsAccount() {
        mockCredentialManager.addCredentials(
            "profile:foo",
            AwsBasicCredentials.create("Access", "Secret"),
            isValid = true,
            awsAccountId = "111111111111"
        )

        val accountCache = DefaultAwsAccountCache(delegateMock())
        assertThat(accountCache.awsAccount(mockCredentialManager.getCredentialProvider("profile:foo"))).isEqualTo("111111111111")
    }

    @Test
    fun modifyCredentialProviderUpdatesAwsAccount() {
        mockCredentialManager.addCredentials(
            "profile:foo",
            AwsBasicCredentials.create("Access", "Secret"),
            isValid = true,
            awsAccountId = "111111111111"
        )

        val accountCache = DefaultAwsAccountCache(delegateMock())
        assertThat(accountCache.awsAccount(mockCredentialManager.getCredentialProvider("profile:foo"))).isEqualTo("111111111111")

        mockCredentialManager.addCredentials(
            "profile:foo",
            AwsBasicCredentials.create("Access2", "Secret2"),
            isValid = true,
            awsAccountId = "222222222222"
        )

        ApplicationManager.getApplication().messageBus.syncPublisher(CredentialManager.CREDENTIALS_CHANGED)
            .providerRemoved("profile:foo")

        assertThat(accountCache.awsAccount(mockCredentialManager.getCredentialProvider("profile:foo"))).isEqualTo("222222222222")
    }
}