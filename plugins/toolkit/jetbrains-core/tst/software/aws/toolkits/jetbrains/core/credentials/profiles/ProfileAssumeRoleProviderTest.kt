// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.profiles

import com.intellij.openapi.ui.TestDialogManager
import com.intellij.openapi.ui.TestInputDialog
import com.intellij.testFramework.ApplicationRule
import com.intellij.testFramework.RuleChain
import org.assertj.core.api.Assertions.assertThat
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.argumentCaptor
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.mock
import org.mockito.kotlin.stub
import org.mockito.kotlin.verify
import software.amazon.awssdk.auth.credentials.AwsCredentialsProvider
import software.amazon.awssdk.profiles.ProfileProperty
import software.amazon.awssdk.services.sts.StsClient
import software.amazon.awssdk.services.sts.model.AssumeRoleRequest
import software.amazon.awssdk.services.sts.model.AssumeRoleResponse
import software.amazon.awssdk.utils.SdkAutoCloseable
import software.aws.toolkits.core.region.anAwsRegion
import software.aws.toolkits.core.utils.test.aString
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import java.time.Duration
import java.time.Instant

class ProfileAssumeRoleProviderTest {
    private val application = ApplicationRule()
    private val clientManager = MockClientManagerRule()

    @Rule
    @JvmField
    val ruleChain = RuleChain(application, clientManager)

    private val mfaToken = "SomeToken"
    private lateinit var parentProvider: AwsCredentialsProvider
    private lateinit var stsClient: StsClient

    @Before
    fun setup() {
        parentProvider = mock(extraInterfaces = arrayOf(SdkAutoCloseable::class))

        stsClient = clientManager.create<StsClient>().stub {
            on { assumeRole(any<AssumeRoleRequest>()) } doReturn AssumeRoleResponse.builder()
                .credentials { c ->
                    c.accessKeyId(aString())
                    c.secretAccessKey(aString())
                    c.sessionToken(aString())
                    c.expiration(Instant.now().plus(Duration.ofHours(1)))
                }.build()
        }

        TestDialogManager.setTestInputDialog { mfaToken }
    }

    @After
    fun tearDown() {
        TestDialogManager.setTestInputDialog(TestInputDialog.DEFAULT)
    }

    @Test
    fun `role_arn gets passed`() {
        val role = aString()
        val profile = profile {
            put(ProfileProperty.ROLE_ARN, role)
        }

        ProfileAssumeRoleProvider(parentProvider, anAwsRegion(), profile).resolveCredentials()

        argumentCaptor<AssumeRoleRequest> {
            verify(stsClient).assumeRole(capture())

            assertThat(firstValue.roleArn()).isEqualTo(role)
        }
    }

    @Test
    fun `duration_seconds gets respected if provided`() {
        val profile = profile {
            put(ProfileProperty.ROLE_ARN, aString())
            put(ProfileProperty.DURATION_SECONDS, "12345")
        }

        ProfileAssumeRoleProvider(parentProvider, anAwsRegion(), profile).resolveCredentials()

        argumentCaptor<AssumeRoleRequest> {
            verify(stsClient).assumeRole(capture())

            assertThat(firstValue.durationSeconds()).isEqualTo(12345)
        }
    }

    @Test
    fun `duration_seconds uses default if not provided`() {
        val profile = profile {
            put(ProfileProperty.ROLE_ARN, aString())
            put(ProfileProperty.DURATION_SECONDS, "abc")
        }

        ProfileAssumeRoleProvider(parentProvider, anAwsRegion(), profile).resolveCredentials()

        argumentCaptor<AssumeRoleRequest> {
            verify(stsClient).assumeRole(capture())

            assertThat(firstValue.durationSeconds()).isEqualTo(3600)
        }
    }

    @Test
    fun `duration_seconds uses default if invalid format`() {
        val profile = profile {
            put(ProfileProperty.ROLE_ARN, aString())
        }

        ProfileAssumeRoleProvider(parentProvider, anAwsRegion(), profile).resolveCredentials()

        argumentCaptor<AssumeRoleRequest> {
            verify(stsClient).assumeRole(capture())

            assertThat(firstValue.durationSeconds()).isEqualTo(3600)
        }
    }

    @Test
    fun `MFA is prompted if keys are specified`() {
        val mfaSerial = aString()
        val profile = profile {
            put(ProfileProperty.ROLE_ARN, aString())
            put(ProfileProperty.MFA_SERIAL, mfaSerial)
        }

        ProfileAssumeRoleProvider(parentProvider, anAwsRegion(), profile).resolveCredentials()

        argumentCaptor<AssumeRoleRequest> {
            verify(stsClient).assumeRole(capture())

            assertThat(firstValue.tokenCode()).isEqualTo(mfaToken)
        }
    }

    @Test
    fun `external ID is respected if provided`() {
        val id = aString()
        val profile = profile {
            put(ProfileProperty.ROLE_ARN, aString())
            put(ProfileProperty.EXTERNAL_ID, id)
        }

        ProfileAssumeRoleProvider(parentProvider, anAwsRegion(), profile).resolveCredentials()

        argumentCaptor<AssumeRoleRequest> {
            verify(stsClient).assumeRole(capture())

            assertThat(firstValue.externalId()).isEqualTo(id)
        }
    }

    @Test
    fun `role session name is respected if provided`() {
        val name = aString()
        val profile = profile {
            put(ProfileProperty.ROLE_ARN, aString())
            put(ProfileProperty.ROLE_SESSION_NAME, name)
        }

        ProfileAssumeRoleProvider(parentProvider, anAwsRegion(), profile).resolveCredentials()

        argumentCaptor<AssumeRoleRequest> {
            verify(stsClient).assumeRole(capture())

            assertThat(firstValue.roleSessionName()).isEqualTo(name)
        }
    }

    @Test
    fun `calling close shuts down parent provider and client`() {
        val profile = profile {
            put(ProfileProperty.ROLE_ARN, aString())
        }

        ProfileAssumeRoleProvider(parentProvider, anAwsRegion(), profile).close()

        verify(stsClient).close()
        verify(parentProvider as SdkAutoCloseable).close()
    }
}
