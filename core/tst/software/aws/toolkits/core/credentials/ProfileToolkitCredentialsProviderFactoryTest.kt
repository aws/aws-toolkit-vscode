// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.credentials

import com.nhaarman.mockitokotlin2.any
import com.nhaarman.mockitokotlin2.mock
import com.nhaarman.mockitokotlin2.reset
import com.nhaarman.mockitokotlin2.stub
import com.nhaarman.mockitokotlin2.times
import com.nhaarman.mockitokotlin2.verify
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.assertj.core.api.Condition
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import software.amazon.awssdk.auth.credentials.AwsCredentials
import software.amazon.awssdk.auth.credentials.AwsSessionCredentials
import software.amazon.awssdk.http.AbortableCallable
import software.amazon.awssdk.http.AbortableInputStream
import software.amazon.awssdk.http.SdkHttpClient
import software.amazon.awssdk.http.SdkHttpFullResponse
import software.amazon.awssdk.profiles.Profile
import software.amazon.awssdk.profiles.ProfileFile
import software.amazon.awssdk.profiles.ProfileProperty.AWS_ACCESS_KEY_ID
import software.amazon.awssdk.profiles.ProfileProperty.AWS_SECRET_ACCESS_KEY
import software.amazon.awssdk.profiles.ProfileProperty.AWS_SESSION_TOKEN
import software.aws.toolkits.core.region.ToolkitRegionProvider
import java.io.File
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.time.temporal.TemporalAccessor

class ProfileToolkitCredentialsProviderFactoryTest {
    @Rule
    @JvmField
    val temporaryFolder = TemporaryFolder()

    private lateinit var profileFile: File
    private val mockSdkHttpClient: SdkHttpClient = mock()
    private val mockRegionProvider: ToolkitRegionProvider = mock()

    @Before
    fun setUp() {
        profileFile = temporaryFolder.newFile("config")
        reset(mockSdkHttpClient, mockRegionProvider)
    }

    @Test
    fun testLoadingWithEmptyProfiles() {
        val providerFactory = createProviderFactory()
        assertThat(providerFactory.listCredentialProviders()).isEmpty()
    }

    @Test
    fun testLoadingWithExpectedProfiles() {
        profileFile.writeText(TEST_PROFILE_FILE_CONTENTS)

        val providerFactory = createProviderFactory()

        assertThat(providerFactory.listCredentialProviders())
            .hasSize(2)
            .has(correctProfile(FOO_PROFILE))
            .has(correctProfile(BAR_PROFILE))
    }

    @Test
    fun testCreationOfBasicCredentials() {
        profileFile.writeText(TEST_PROFILE_FILE_CONTENTS)

        val providerFactory = createProviderFactory()

        val credentialsProvider = providerFactory.get("profile:bar")
        assertThat(credentialsProvider).isNotNull
        assertThat(credentialsProvider!!.resolveCredentials()).isInstanceOf(AwsCredentials::class.java)
    }

    @Test
    fun testCreationOfStaticSessionCredentials() {
        profileFile.writeText(TEST_PROFILE_FILE_CONTENTS)

        val providerFactory = createProviderFactory()

        val credentialsProvider = providerFactory.get("profile:foo")
        assertThat(credentialsProvider).isNotNull
        assertThat(credentialsProvider!!.resolveCredentials()).isInstanceOf(AwsCredentials::class.java)
    }

    @Test
    fun testAssumingRoles() {
        profileFile.writeText(
            """
            [profile role]
            role_arn=arn1
            role_session_name=testSession
            source_profile=source_profile
            external_id=externalId
            source_profile=source_profile

            [profile source_profile]
            aws_access_key_id=BarAccessKey
            aws_secret_access_key=BarSecretKey
        """.trimIndent()
        )

        mockSdkHttpClient.stub {
            on { prepareRequest(any(), any()) }
                .thenReturn(
                    SdkHttpFullResponse.builder()
                        .statusCode(200)
                        .content(
                            createAssumeRoleResponse(
                                "AccessKey",
                                "SecretKey",
                                "SessionToken",
                                ZonedDateTime.now().plus(1, ChronoUnit.HOURS)
                            )
                        )
                        .build().toAbortable()
                )
        }

        val providerFactory = createProviderFactory()

        val credentialsProvider = providerFactory.get("profile:role")
        assertThat(credentialsProvider).isNotNull
        assertThat(credentialsProvider!!.resolveCredentials()).isInstanceOf(AwsSessionCredentials::class.java).satisfies {
            val sessionCredentials = it as AwsSessionCredentials
            assertThat(sessionCredentials.accessKeyId()).isEqualTo("AccessKey")
            assertThat(sessionCredentials.secretAccessKey()).isEqualTo("SecretKey")
            assertThat(sessionCredentials.sessionToken()).isEqualTo("SessionToken")
        }
    }

    @Test
    fun testAssumingRoleChained() {
        profileFile.writeText(
            """
            [profile role]
            role_arn=arn1
            source_profile=source_profile

            [profile source_profile]
            role_arn=arn2
            source_profile=source_profile2

            [profile source_profile2]
            aws_access_key_id=BarAccessKey
            aws_secret_access_key=BarSecretKey
        """.trimIndent()
        )

        // In reverse order, since chain is built bottom up
        mockSdkHttpClient.stub {
            on { prepareRequest(any(), any()) }
                .thenReturn(
                    SdkHttpFullResponse.builder()
                        .statusCode(200)
                        .content(
                            createAssumeRoleResponse(
                                "AccessKey2",
                                "SecretKey2",
                                "SessionToken2",
                                ZonedDateTime.now().plus(1, ChronoUnit.HOURS)
                            )
                        )
                        .build().toAbortable(),
                    SdkHttpFullResponse.builder()
                        .statusCode(200)
                        .content(
                            createAssumeRoleResponse(
                                "AccessKey",
                                "SecretKey",
                                "SessionToken",
                                ZonedDateTime.now().plus(1, ChronoUnit.HOURS)
                            )
                        )
                        .build().toAbortable()
                )
        }

        val providerFactory = createProviderFactory()

        val credentialsProvider = providerFactory.get("profile:role")
        assertThat(credentialsProvider).isNotNull
        assertThat(credentialsProvider!!.resolveCredentials()).isInstanceOf(AwsSessionCredentials::class.java).satisfies {
            val sessionCredentials = it as AwsSessionCredentials
            assertThat(sessionCredentials.accessKeyId()).isEqualTo("AccessKey")
            assertThat(sessionCredentials.secretAccessKey()).isEqualTo("SecretKey")
            assertThat(sessionCredentials.sessionToken()).isEqualTo("SessionToken")
        }

        verify(mockSdkHttpClient, times(2)).prepareRequest(any(), any())
    }

    @Test
    fun testSourceProfileDoesNotExist() {
        profileFile.writeText(
            """
            [profile role]
            role_arn=arn1
            role_session_name=testSession
            source_profile=source_profile
            external_id=externalId
        """.trimIndent()
        )

        assertThatThrownBy {
            ProfileToolkitCredentialsProvider(
                profiles(),
                profiles()["role"]!!,
                mockSdkHttpClient,
                mockRegionProvider
            )
        }.isInstanceOf(IllegalArgumentException::class.java)
            .hasMessage("Profile `role` references source profile `source_profile` which does not exist")
    }

    @Test
    fun testCircularChainProfiles() {
        profileFile.writeText(
            """
            [profile role]
            role_arn=arn1
            source_profile=source_profile

            [profile source_profile]
            role_arn=arn2
            source_profile=source_profile2

            [profile source_profile2]
            role_arn=arn3
            source_profile=source_profile3

            [profile source_profile3]
            role_arn=arn4
            source_profile=source_profile
        """.trimIndent()
        )

        assertThatThrownBy {
            ProfileToolkitCredentialsProvider(
                profiles(),
                profiles()["role"]!!,
                mockSdkHttpClient,
                mockRegionProvider
            )
        }.isInstanceOf(IllegalArgumentException::class.java)
            .hasMessage("A circular profile dependency was found between role->source_profile->source_profile2->source_profile3->source_profile")
    }

    private fun profiles(): MutableMap<String, Profile> {
        return ProfileFile.builder()
            .content(profileFile.toPath())
            .type(ProfileFile.Type.CONFIGURATION)
            .build()
            .profiles()
    }

    private fun correctProfile(expectedProfile: Profile): Condition<Iterable<ToolkitCredentialsProvider>> {
        return object : Condition<Iterable<ToolkitCredentialsProvider>>(expectedProfile.toString()) {
            override fun matches(value: Iterable<ToolkitCredentialsProvider>): Boolean {
                return value.filterIsInstance<ProfileToolkitCredentialsProvider>()
                    .any { it.profile == expectedProfile }
            }
        }
    }

    private fun createProviderFactory() =
        ProfileToolkitCredentialsProviderFactory(mockSdkHttpClient, mockRegionProvider, profileFile.toPath())

    private fun createAssumeRoleResponse(
        accessKey: String,
        secretKey: String,
        sessionToken: String,
        expiration: TemporalAccessor
    ): AbortableInputStream {
        val expirationString = DateTimeFormatter.ISO_INSTANT.format(expiration)

        val body = """
                    <AssumeRoleResponse xmlns="https://sts.amazonaws.com/doc/2011-06-15/">
                        <AssumeRoleResult>
                            <Credentials>
                                <SecretAccessKey>$secretKey</SecretAccessKey>
                                <SessionToken>$sessionToken</SessionToken>
                                <Expiration>$expirationString</Expiration>
                                <AccessKeyId>$accessKey</AccessKeyId>
                            </Credentials>
                        </AssumeRoleResult>
                    </AssumeRoleResponse>
                    """.trimIndent()

        return AbortableInputStream.create(body.toByteArray().inputStream())
    }

    companion object {
        val TEST_PROFILE_FILE_CONTENTS = """
            [profile bar]
            aws_access_key_id=BarAccessKey
            aws_secret_access_key=BarSecretKey

            [profile foo]
            aws_access_key_id=FooAccessKey
            aws_secret_access_key=FooSecretKey
            aws_session_token=FooSessionToken
        """.trimIndent()

        private const val FOO_PROFILE_NAME = "foo"
        private const val FOO_ACCESS_KEY = "FooAccessKey"
        private const val FOO_SECRET_KEY = "FooSecretKey"
        private const val FOO_SESSION_TOKEN = "FooSessionToken"

        private const val BAR_PROFILE_NAME = "bar"
        private const val BAR_ACCESS_KEY = "BarAccessKey"
        private const val BAR_SECRET_KEY = "BarSecretKey"

        private val FOO_PROFILE: Profile = Profile.builder()
            .name(FOO_PROFILE_NAME)
            .properties(
                mapOf(
                    AWS_ACCESS_KEY_ID to FOO_ACCESS_KEY,
                    AWS_SECRET_ACCESS_KEY to FOO_SECRET_KEY,
                    AWS_SESSION_TOKEN to FOO_SESSION_TOKEN
                )
            )
            .build()

        private val BAR_PROFILE: Profile = Profile.builder()
            .name(BAR_PROFILE_NAME)
            .properties(
                mapOf(
                    AWS_ACCESS_KEY_ID to BAR_ACCESS_KEY,
                    AWS_SECRET_ACCESS_KEY to BAR_SECRET_KEY
                )
            )
            .build()
    }
}

private fun SdkHttpFullResponse.toAbortable(): AbortableCallable<SdkHttpFullResponse> {
    val result = this
    return object : AbortableCallable<SdkHttpFullResponse> {
        override fun call(): SdkHttpFullResponse {
            return result
        }

        override fun abort() {}
    }
}
