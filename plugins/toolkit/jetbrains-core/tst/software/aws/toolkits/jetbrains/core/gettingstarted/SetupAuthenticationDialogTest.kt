// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.gettingstarted

import com.intellij.openapi.ui.TestDialog
import com.intellij.openapi.ui.TestDialogManager
import com.intellij.testFramework.ProjectExtension
import com.intellij.testFramework.runInEdtAndWait
import io.mockk.every
import io.mockk.junit5.MockKExtension
import io.mockk.mockk
import io.mockk.mockkStatic
import io.mockk.verify
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.junit.jupiter.api.extension.ExtendWith
import org.junit.jupiter.api.extension.RegisterExtension
import org.mockito.kotlin.any
import org.mockito.kotlin.stub
import org.mockito.kotlin.whenever
import software.amazon.awssdk.profiles.Profile
import software.amazon.awssdk.services.sts.StsClient
import software.amazon.awssdk.services.sts.model.GetCallerIdentityRequest
import software.amazon.awssdk.services.sts.model.GetCallerIdentityResponse
import software.amazon.awssdk.services.sts.model.StsException
import software.aws.toolkits.core.region.Endpoint
import software.aws.toolkits.core.region.Service
import software.aws.toolkits.core.utils.test.aString
import software.aws.toolkits.jetbrains.core.MockClientManagerExtension
import software.aws.toolkits.jetbrains.core.credentials.ConfigFilesFacade
import software.aws.toolkits.jetbrains.core.credentials.UserConfigSsoSessionProfile
import software.aws.toolkits.jetbrains.core.credentials.loginSso
import software.aws.toolkits.jetbrains.core.credentials.sono.SONO_REGION
import software.aws.toolkits.jetbrains.core.credentials.sono.SONO_URL
import software.aws.toolkits.jetbrains.core.region.MockRegionProviderExtension
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.FeatureId

@ExtendWith(MockKExtension::class)
class SetupAuthenticationDialogTest {
    companion object {
        @JvmField
        @RegisterExtension
        val projectExtension = ProjectExtension()
    }

    @JvmField
    @RegisterExtension
    val mockClientManager = MockClientManagerExtension()

    @JvmField
    @RegisterExtension
    val mockRegionProvider = MockRegionProviderExtension()

    @Test
    fun `login to IdC tab`() {
        mockkStatic(::authAndUpdateConfig)

        val startUrl = aString()
        val region = mockRegionProvider.createAwsRegion()
        val scopes = listOf(aString(), aString(), aString())
        mockRegionProvider.addService(
            "sso",
            Service(
                endpoints = mapOf(region.id to Endpoint()),
                isRegionalized = true,
                partitionEndpoint = region.partitionId
            )
        )

        val configFacade = mockk<ConfigFilesFacade>(relaxed = true)
        TestDialogManager.setTestDialog(TestDialog.OK)
        val state = SetupAuthenticationDialogState().apply {
            idcTabState.apply {
                this.startUrl = startUrl
                this.region = region
            }
        }

        runInEdtAndWait {
            SetupAuthenticationDialog(
                projectExtension.project,
                scopes = scopes,
                state = state,
                configFilesFacade = configFacade,
                sourceOfEntry = SourceOfEntry.UNKNOWN,
                featureId = FeatureId.Unknown
            ).apply {
                try {
                    doOKAction()
                } finally {
                    close(0)
                }
            }
        }

        verify {
            authAndUpdateConfig(
                projectExtension.project,
                UserConfigSsoSessionProfile("", region.id, startUrl, scopes),
                configFacade,
                any(),
                any()
            )
        }
    }

    @Test
    fun `login to IdC tab and request role`() {
        mockkStatic(::authAndUpdateConfig)

        val startUrl = aString()
        val region = mockRegionProvider.createAwsRegion()
        val scopes = listOf(aString(), aString(), aString())
        mockRegionProvider.addService(
            "sso",
            Service(
                endpoints = mapOf(region.id to Endpoint()),
                isRegionalized = true,
                partitionEndpoint = region.partitionId
            )
        )

        val configFacade = mockk<ConfigFilesFacade>(relaxed = true)
        TestDialogManager.setTestDialog(TestDialog.OK)
        val state = SetupAuthenticationDialogState().apply {
            idcTabState.apply {
                this.startUrl = startUrl
                this.region = region
            }
        }

        runInEdtAndWait {
            SetupAuthenticationDialog(
                projectExtension.project,
                scopes = scopes,
                state = state,
                promptForIdcPermissionSet = true,
                configFilesFacade = configFacade,
                sourceOfEntry = SourceOfEntry.UNKNOWN,
                featureId = FeatureId.Unknown
            ).apply {
                try {
                    doOKAction()
                } finally {
                    close(0)
                }
            }
        }

        verify {
            authAndUpdateConfig(
                projectExtension.project,
                UserConfigSsoSessionProfile("", region.id, startUrl, scopes + "sso:account:access"),
                configFacade,
                any(),
                any()
            )
        }
    }

    @Test
    fun `login to Builder ID tab`() {
        mockkStatic(::loginSso)
        every { loginSso(any(), any(), any(), any()) } answers { mockk() }

        val state = SetupAuthenticationDialogState().apply {
            selectedTab.set(SetupAuthenticationTabs.BUILDER_ID)
        }

        runInEdtAndWait {
            SetupAuthenticationDialog(
                projectExtension.project,
                state = state,
                sourceOfEntry = SourceOfEntry.UNKNOWN,
                featureId = FeatureId.Unknown
            ).apply {
                try {
                    doOKAction()
                } finally {
                    close(0)
                }
            }
        }

        verify {
            loginSso(projectExtension.project, SONO_URL, SONO_REGION, emptyList())
        }
    }

    @Test
    fun `validate IdC tab`() {
        val state = SetupAuthenticationDialogState().apply {
            selectedTab.set(SetupAuthenticationTabs.IDENTITY_CENTER)
        }

        runInEdtAndWait {
            val validation = SetupAuthenticationDialog(
                projectExtension.project,
                state = state,
                sourceOfEntry = SourceOfEntry.UNKNOWN,
                featureId = FeatureId.Unknown
            ).run {
                try {
                    performValidateAll()
                } finally {
                    close(0)
                }
            }

            assertThat(validation).satisfies {
                assertThat(it).hasSize(2)
                assertThat(it).allSatisfy { error ->
                    assertThat(error.message).contains("Must not be empty")
                }
            }
        }
    }

    @Test
    fun `validate Builder ID tab`() {
        val state = SetupAuthenticationDialogState().apply {
            selectedTab.set(SetupAuthenticationTabs.BUILDER_ID)
        }

        runInEdtAndWait {
            val validation = SetupAuthenticationDialog(
                projectExtension.project,
                state = state,
                sourceOfEntry = SourceOfEntry.UNKNOWN,
                featureId = FeatureId.Unknown
            ).run {
                try {
                    performValidateAll()
                } finally {
                    close(0)
                }
            }

            assertThat(validation).isEmpty()
        }
    }

    @Test
    fun `validate IAM tab`() {
        val state = SetupAuthenticationDialogState().apply {
            selectedTab.set(SetupAuthenticationTabs.IAM_LONG_LIVED)
            iamTabState.profileName = ""
        }

        runInEdtAndWait {
            val validation = SetupAuthenticationDialog(
                projectExtension.project,
                state = state,
                sourceOfEntry = SourceOfEntry.UNKNOWN,
                featureId = FeatureId.Unknown
            ).run {
                try {
                    performValidateAll()
                } finally {
                    close(0)
                }
            }

            assertThat(validation).satisfies {
                assertThat(it).hasSize(3)
                assertThat(it).allSatisfy { error ->
                    assertThat(error.message).contains("Must not be empty")
                }
            }
        }
    }

    @Test
    fun `validate IAM tab fails if credentials are invalid`() {
        val state = SetupAuthenticationDialogState().apply {
            selectedTab.set(SetupAuthenticationTabs.IAM_LONG_LIVED)
            iamTabState.apply {
                profileName = "test"
                accessKey = "invalid"
                secretKey = "invalid"
            }
        }

        mockClientManager.create<StsClient>().stub {
            whenever(it.getCallerIdentity(any<GetCallerIdentityRequest>())).thenThrow(StsException.builder().message("Some service exception message").build())
        }

        runInEdtAndWait {
            val sut = SetupAuthenticationDialog(
                projectExtension.project,
                state = state,
                sourceOfEntry = SourceOfEntry.UNKNOWN,
                featureId = FeatureId.Unknown
            )
            val exception = assertThrows<Exception> { sut.doOKAction() }
            assertThat(exception.message).isEqualTo(message("gettingstarted.setup.iam.profile.invalid_credentials"))
        }
    }

    @Test
    fun `validate IAM tab succeeds if credentials are invalid`() {
        val state = SetupAuthenticationDialogState().apply {
            selectedTab.set(SetupAuthenticationTabs.IAM_LONG_LIVED)
            iamTabState.apply {
                profileName = "test"
                accessKey = "validAccess"
                secretKey = "validSecret"
            }
        }

        mockClientManager.create<StsClient>().stub {
            whenever(it.getCallerIdentity(any<GetCallerIdentityRequest>())).thenReturn(GetCallerIdentityResponse.builder().build())
        }

        val configFacade = mockk<ConfigFilesFacade>(relaxed = true)
        runInEdtAndWait {
            SetupAuthenticationDialog(
                projectExtension.project,
                state = state,
                configFilesFacade = configFacade,
                sourceOfEntry = SourceOfEntry.UNKNOWN,
                featureId = FeatureId.Unknown
            )
                .doOKAction()
        }

        verify {
            configFacade.appendProfileToCredentials(
                Profile.builder()
                    .name("test")
                    .properties(
                        mapOf(
                            "aws_access_key_id" to "validAccess",
                            "aws_secret_access_key" to "validSecret"
                        )
                    )
                    .build()
            )
        }
    }
}
