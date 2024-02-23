// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.gettingstarted

import com.intellij.testFramework.ProjectExtension
import com.intellij.testFramework.runInEdtAndWait
import io.mockk.every
import io.mockk.junit5.MockKExtension
import io.mockk.justRun
import io.mockk.mockk
import io.mockk.verify
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.extension.ExtendWith
import org.junit.jupiter.api.extension.RegisterExtension
import org.mockito.kotlin.any
import software.amazon.awssdk.profiles.Profile
import software.amazon.awssdk.services.sso.SsoClient
import software.amazon.awssdk.services.sso.model.RoleInfo
import software.aws.toolkits.core.utils.test.aString
import software.aws.toolkits.jetbrains.core.MockClientManagerExtension
import software.aws.toolkits.jetbrains.core.credentials.ConfigFilesFacade
import software.aws.toolkits.jetbrains.core.region.MockRegionProviderExtension
import software.aws.toolkits.resources.message

@ExtendWith(MockKExtension::class)
class IdcRolePopupTest {
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
    fun `validate role selected`() {
        val state = IdcRolePopupState()
        mockClientManager.create<SsoClient>()

        runInEdtAndWait {
            val validation = IdcRolePopup(projectExtension.project, aString(), aString(), mockk(), state, mockk()).run {
                try {
                    performValidateAll()
                } finally {
                    close(0)
                }
            }

            assertThat(validation).singleElement().satisfies {
                assertThat(it.okEnabled).isFalse()
                assertThat(it.message).contains(message("gettingstarted.setup.error.not_selected"))
            }
        }
    }

    @Test
    fun `success writes profile to config`() {
        val sessionName = aString()
        val roleInfo = RoleInfo.builder()
            .roleName(aString())
            .accountId(aString())
            .build()
        val state = IdcRolePopupState().apply {
            this.roleInfo = roleInfo
        }
        val configFilesFacade = mockk<ConfigFilesFacade> {
            every { readAllProfiles() } returns emptyMap()
            justRun { appendProfileToConfig(any()) }
        }

        mockClientManager.create<SsoClient>()

        runInEdtAndWait {
            val sut = IdcRolePopup(
                projectExtension.project,
                region = aString(),
                sessionName = sessionName,
                tokenProvider = mockk(),
                state = state,
                configFilesFacade = configFilesFacade
            )
            try {
                sut.doOkActionWithRoleInfo(roleInfo)
            } finally {
                sut.close(0)
            }

            verify {
                configFilesFacade.appendProfileToConfig(
                    Profile.builder()
                        .name("$sessionName-${roleInfo.accountId()}-${roleInfo.roleName()}")
                        .properties(
                            mapOf(
                                "sso_session" to sessionName,
                                "sso_account_id" to roleInfo.accountId(),
                                "sso_role_name" to roleInfo.roleName()
                            )
                        )
                        .build()
                )
            }
        }
    }
}
