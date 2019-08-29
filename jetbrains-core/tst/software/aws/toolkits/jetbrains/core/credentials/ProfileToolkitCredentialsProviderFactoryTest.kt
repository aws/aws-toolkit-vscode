// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.openapi.ui.Messages
import com.intellij.openapi.ui.TestInputDialog
import com.intellij.testFramework.ProjectRule
import com.nhaarman.mockitokotlin2.any
import com.nhaarman.mockitokotlin2.argumentCaptor
import com.nhaarman.mockitokotlin2.atLeastOnce
import com.nhaarman.mockitokotlin2.mock
import com.nhaarman.mockitokotlin2.reset
import com.nhaarman.mockitokotlin2.stub
import com.nhaarman.mockitokotlin2.times
import com.nhaarman.mockitokotlin2.verify
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.assertj.core.api.Condition
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import software.amazon.awssdk.auth.credentials.AwsCredentials
import software.amazon.awssdk.auth.credentials.AwsSessionCredentials
import software.amazon.awssdk.http.AbortableInputStream
import software.amazon.awssdk.http.ExecutableHttpRequest
import software.amazon.awssdk.http.HttpExecuteRequest
import software.amazon.awssdk.http.HttpExecuteResponse
import software.amazon.awssdk.http.SdkHttpClient
import software.amazon.awssdk.http.SdkHttpFullResponse
import software.amazon.awssdk.profiles.Profile
import software.amazon.awssdk.profiles.ProfileFile
import software.amazon.awssdk.profiles.ProfileProperty.AWS_ACCESS_KEY_ID
import software.amazon.awssdk.profiles.ProfileProperty.AWS_SECRET_ACCESS_KEY
import software.amazon.awssdk.profiles.ProfileProperty.AWS_SESSION_TOKEN
import software.amazon.awssdk.profiles.ProfileProperty.CREDENTIAL_PROCESS
import software.aws.toolkits.core.credentials.ToolkitCredentialsProvider
import software.aws.toolkits.core.credentials.ToolkitCredentialsProviderManager
import software.aws.toolkits.core.region.ToolkitRegionProvider
import software.aws.toolkits.core.rules.SystemPropertyHelper
import software.aws.toolkits.jetbrains.core.credentials.profiles.ProfileHolder
import software.aws.toolkits.jetbrains.core.credentials.profiles.ProfileToolkitCredentialsProvider
import software.aws.toolkits.jetbrains.core.credentials.profiles.ProfileToolkitCredentialsProviderFactory
import software.aws.toolkits.jetbrains.core.credentials.profiles.ProfileWatcher
import software.aws.toolkits.jetbrains.utils.test.retryableAssert
import java.io.File
import java.time.Duration
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.time.temporal.TemporalAccessor

class ProfileToolkitCredentialsProviderFactoryTest {
    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @Rule
    @JvmField
    val temporaryFolder = TemporaryFolder()

    @Rule
    @JvmField
    val systemPropertyHelper = SystemPropertyHelper()

    private lateinit var profileFile: File
    private lateinit var credentialsFile: File
    private val mockSdkHttpClient: SdkHttpClient = mock()
    private val mockRegionProvider: ToolkitRegionProvider = mock()
    private val mockProviderManager: ToolkitCredentialsProviderManager = mock()
    private var profileFactory: ProfileToolkitCredentialsProviderFactory? = null
    private var profileWatcher: ProfileWatcher? = null

    @Before
    fun setUp() {
        val awsFolder = temporaryFolder.newFolder(".aws")
        profileFile = File(awsFolder, "config")
        credentialsFile = File(awsFolder, "credentials")
        System.getProperties().setProperty("aws.configFile", profileFile.absolutePath)
        System.getProperties().setProperty("aws.sharedCredentialsFile", credentialsFile.absolutePath)

        reset(mockSdkHttpClient, mockRegionProvider)

        Messages.setTestInputDialog { MFA_TOKEN }
    }

    @After
    fun tearDown() {
        Messages.setTestInputDialog(TestInputDialog.DEFAULT)
        profileFactory?.shutDown()
        profileWatcher?.dispose()
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
            .hasSize(3)
            .has(correctProfile(FOO_PROFILE))
            .has(correctProfile(BAR_PROFILE))
            .has(correctProfile(BAZ_PROFILE))
    }

    @Test
    fun testLoadingWithIllegalFormat() {
        profileFile.writeText("""
            [profile bar]
            aws_access_key_id BarAccessKey
            aws_secret_access_key=BarSecretKey

            [profile foo]
            aws_access_key_id=FooAccessKey
            aws_secret_access_key=FooSecretKey
            aws_session_token=FooSessionToken
        """.trimIndent())

        val providerFactory = createProviderFactory()

        assertThat(providerFactory.listCredentialProviders())
            .isEmpty()
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
    fun oneFailureDoesNotCauseOtherCredentialsToFail() {
        profileFile.writeText(
            """
            [profile role]
            role_arn=arn1
            role_session_name=testSession
            external_id=externalId
            source_profile=doNotExist

            [profile another_profile]
            aws_access_key_id=BarAccessKey
            aws_secret_access_key=BarSecretKey
            """.trimIndent()
        )

        val providerFactory = createProviderFactory()
        assertThat(providerFactory.listCredentialProviders()).hasOnlyOneElementSatisfying {
            assertThat(it.id).isEqualTo(
                "profile:another_profile"
            )
        }
    }

    @Test
    fun testAssumingRoles() {
        profileFile.writeText(
            """
            [profile role]
            role_arn=arn1
            role_session_name=testSession
            external_id=externalId
            source_profile=source_profile

            [profile source_profile]
            aws_access_key_id=BarAccessKey
            aws_secret_access_key=BarSecretKey
            """.trimIndent()
        )

        mockSdkHttpClient.stub {
            on { prepareRequest(any()) }
                .thenReturn(
                    createAssumeRoleResponse(
                        "AccessKey",
                        "SecretKey",
                        "SessionToken",
                        ZonedDateTime.now().plus(1, ChronoUnit.HOURS)
                    )
                )
        }

        val providerFactory = createProviderFactory()

        val credentialsProvider = providerFactory.get("profile:role")
        assertThat(credentialsProvider).isNotNull
        assertThat(credentialsProvider!!.resolveCredentials()).isInstanceOf(AwsSessionCredentials::class.java)
            .satisfies {
                val sessionCredentials = it as AwsSessionCredentials
                assertThat(sessionCredentials.accessKeyId()).isEqualTo("AccessKey")
                assertThat(sessionCredentials.secretAccessKey()).isEqualTo("SecretKey")
                assertThat(sessionCredentials.sessionToken()).isEqualTo("SessionToken")
            }
    }

    @Test
    fun testAssumingRolesMfa() {
        profileFile.writeText(
            """
            [profile role]
            role_arn=arn1
            role_session_name=testSession
            external_id=externalId
            mfa_serial=someSerialArn
            source_profile=source_profile

            [profile source_profile]
            aws_access_key_id=BarAccessKey
            aws_secret_access_key=BarSecretKey
            """.trimIndent()
        )

        val captor = argumentCaptor<HttpExecuteRequest>()

        mockSdkHttpClient.stub {
            on { prepareRequest(captor.capture()) }
                .thenReturn(
                    createAssumeRoleResponse(
                        "AccessKey",
                        "SecretKey",
                        "SessionToken",
                        ZonedDateTime.now().plus(1, ChronoUnit.HOURS)
                    )
                )
        }

        val providerFactory = createProviderFactory()

        val credentialsProvider = providerFactory.get("profile:role")
        assertThat(credentialsProvider).isNotNull
        assertThat(credentialsProvider!!.resolveCredentials()).isInstanceOf(AwsSessionCredentials::class.java)
            .satisfies {
                val sessionCredentials = it as AwsSessionCredentials
                assertThat(sessionCredentials.accessKeyId()).isEqualTo("AccessKey")
                assertThat(sessionCredentials.secretAccessKey()).isEqualTo("SecretKey")
                assertThat(sessionCredentials.sessionToken()).isEqualTo("SessionToken")
            }

        val content = captor.firstValue.contentStreamProvider().get().newStream().bufferedReader().use { it.readText() }
        assertThat(content).contains("TokenCode=MfaToken")
            .contains("SerialNumber=someSerialArn")
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
            on { prepareRequest(any()) }
                .thenReturn(
                    createAssumeRoleResponse(
                        "AccessKey2",
                        "SecretKey2",
                        "SessionToken2",
                        ZonedDateTime.now().plus(1, ChronoUnit.HOURS)
                    ),
                    createAssumeRoleResponse(
                        "AccessKey",
                        "SecretKey",
                        "SessionToken",
                        ZonedDateTime.now().plus(1, ChronoUnit.HOURS)
                    )
                )
        }

        val providerFactory = createProviderFactory()

        val credentialsProvider = providerFactory.get("profile:role")
        assertThat(credentialsProvider).isNotNull
        assertThat(credentialsProvider!!.resolveCredentials()).isInstanceOf(AwsSessionCredentials::class.java)
            .satisfies {
                val sessionCredentials = it as AwsSessionCredentials
                assertThat(sessionCredentials.accessKeyId()).isEqualTo("AccessKey")
                assertThat(sessionCredentials.secretAccessKey()).isEqualTo("SecretKey")
                assertThat(sessionCredentials.sessionToken()).isEqualTo("SessionToken")
            }

        verify(mockSdkHttpClient, times(2)).prepareRequest(any())
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
                "role",
                mockSdkHttpClient,
                mockRegionProvider
            )
        }.isInstanceOf(IllegalArgumentException::class.java)
            .hasMessage("Profile 'role' references source profile 'source_profile' which does not exist")
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
                "role",
                mockSdkHttpClient,
                mockRegionProvider
            )
        }.isInstanceOf(IllegalArgumentException::class.java)
            .hasMessage("A circular profile dependency was found between role->source_profile->source_profile2->source_profile3->source_profile")
    }

    @Test
    fun testRefreshExistingProfiles() {
        profileFile.writeText(
            """
            [profile foo]
            aws_access_key_id=FooAccessKey
            aws_secret_access_key=FooSecretKey
            aws_session_token=FooSessionToken
            """.trimIndent()
        )

        val providerFactory = createProviderFactory()

        val credentialsProvider = providerFactory.get("profile:foo")
        assertThat(credentialsProvider).isNotNull
        assertThat(credentialsProvider!!.resolveCredentials()).isInstanceOf(AwsSessionCredentials::class.java)
            .satisfies {
                val sessionCredentials = it as AwsSessionCredentials
                assertThat(sessionCredentials.accessKeyId()).isEqualTo("FooAccessKey")
                assertThat(sessionCredentials.secretAccessKey()).isEqualTo("FooSecretKey")
                assertThat(sessionCredentials.sessionToken()).isEqualTo("FooSessionToken")
            }

        // Mac timestamp is 1 sec granularity
        Thread.sleep(1000)

        profileFile.writeText(
            """
            [profile foo]
            aws_access_key_id=FooAccessKey2
            aws_secret_access_key=FooSecretKey2
            aws_session_token=FooSessionToken2
            """.trimIndent()
        )

        retryableAssert(maxAttempts = 5, interval = Duration.ofSeconds(5)) {
            assertThat(credentialsProvider.resolveCredentials()).isInstanceOf(AwsSessionCredentials::class.java)
                .satisfies {
                    val sessionCredentials = it as AwsSessionCredentials
                    assertThat(sessionCredentials.accessKeyId()).isEqualTo("FooAccessKey2")
                    assertThat(sessionCredentials.secretAccessKey()).isEqualTo("FooSecretKey2")
                    assertThat(sessionCredentials.sessionToken()).isEqualTo("FooSessionToken2")
                }

            // TODO: Debug why on windows this is sometimes 1, sometimes 2
            verify(mockProviderManager, atLeastOnce()).providerModified(credentialsProvider)
        }
    }

    @Test
    fun testRefreshDeletesProfiles() {
        profileFile.writeText(
            """
            [profile foo]
            aws_access_key_id=FooAccessKey
            aws_secret_access_key=FooSecretKey
            aws_session_token=FooSessionToken
            """.trimIndent()
        )

        val providerFactory = createProviderFactory()
        val credentialsProvider = providerFactory.get("profile:foo")
        assertThat(credentialsProvider).isNotNull
        assertThat(credentialsProvider!!.resolveCredentials()).isInstanceOf(AwsSessionCredentials::class.java)
            .satisfies {
                val sessionCredentials = it as AwsSessionCredentials
                assertThat(sessionCredentials.accessKeyId()).isEqualTo("FooAccessKey")
                assertThat(sessionCredentials.secretAccessKey()).isEqualTo("FooSecretKey")
                assertThat(sessionCredentials.sessionToken()).isEqualTo("FooSessionToken")
            }

        // Mac timestamp is 1 sec granularity
        Thread.sleep(1000)

        profileFile.writeText("")

        retryableAssert(maxAttempts = 5, interval = Duration.ofSeconds(5)) {
            assertThat(providerFactory.get("profile:foo")).isNull()

            assertThatThrownBy {
                // Old references should now throw exceptions
                credentialsProvider.resolveCredentials()
            }

            verify(mockProviderManager).providerRemoved("profile:foo")
        }
    }

    @Test
    fun testRefreshAddsProfiles() {
        profileFile.writeText("")

        val providerFactory = createProviderFactory()

        val credentialsProvider = providerFactory.get("profile:foo")
        assertThat(credentialsProvider).isNull()

        // Mac timestamp is 1 sec granularity
        Thread.sleep(1000)

        profileFile.writeText(
            """
            [profile foo]
            aws_access_key_id=FooAccessKey
            aws_secret_access_key=FooSecretKey
            aws_session_token=FooSessionToken
            """.trimIndent()
        )

        retryableAssert(maxAttempts = 5, interval = Duration.ofSeconds(5)) {
            assertThat(providerFactory.get("profile:foo")?.resolveCredentials())
                .isInstanceOf(AwsSessionCredentials::class.java)
                .satisfies {
                    val sessionCredentials = it as AwsSessionCredentials
                    assertThat(sessionCredentials.accessKeyId()).isEqualTo("FooAccessKey")
                    assertThat(sessionCredentials.secretAccessKey()).isEqualTo("FooSecretKey")
                    assertThat(sessionCredentials.sessionToken()).isEqualTo("FooSessionToken")
                }
            verify(mockProviderManager).providerAdded(providerFactory.get("profile:foo")!!)
        }
    }

    private fun profiles(): ProfileHolder {
        val profileHolder = ProfileHolder()

        ProfileFile.builder()
            .content(profileFile.toPath())
            .type(ProfileFile.Type.CONFIGURATION)
            .build()
            .profiles()
            .values
            .forEach {
                profileHolder.putProfile(it)
            }

        return profileHolder
    }

    private fun correctProfile(expectedProfile: Profile): Condition<Iterable<ToolkitCredentialsProvider>> =
        object : Condition<Iterable<ToolkitCredentialsProvider>>(expectedProfile.toString()) {
            override fun matches(value: Iterable<ToolkitCredentialsProvider>): Boolean =
                value.filterIsInstance<ProfileToolkitCredentialsProvider>().any {
                    it.profileName == expectedProfile.name()
                }
        }

    private fun createProviderFactory(): ProfileToolkitCredentialsProviderFactory {
        val watcher = ProfileWatcher()
        watcher.start()

        val factory = ProfileToolkitCredentialsProviderFactory(
            mockSdkHttpClient,
            mockRegionProvider,
            mockProviderManager,
            watcher
        )

        profileWatcher = watcher
        profileFactory = factory
        return factory
    }

    private fun createAssumeRoleResponse(
        accessKey: String,
        secretKey: String,
        sessionToken: String,
        expiration: TemporalAccessor
    ): ExecutableHttpRequest {
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

        return object : ExecutableHttpRequest {
            override fun call(): HttpExecuteResponse = HttpExecuteResponse.builder()
                .response(SdkHttpFullResponse.builder()
                    .statusCode(200)
                    .build())
                .responseBody(AbortableInputStream.create(body.toByteArray().inputStream()))
                .build()

            override fun abort() {}
        }
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

            [profile baz]
            credential_process = /path/to/credential/process
        """.trimIndent()

        private const val FOO_PROFILE_NAME = "foo"
        private const val FOO_ACCESS_KEY = "FooAccessKey"
        private const val FOO_SECRET_KEY = "FooSecretKey"
        private const val FOO_SESSION_TOKEN = "FooSessionToken"

        private const val BAR_PROFILE_NAME = "bar"
        private const val BAR_ACCESS_KEY = "BarAccessKey"
        private const val BAR_SECRET_KEY = "BarSecretKey"

        private const val BAZ_PROFILE_NAME = "baz"
        private const val BAZ_CREDENTIAL_PROCESS = "/path/to/credential/process"

        private const val MFA_TOKEN = "MfaToken"

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

        private val BAZ_PROFILE: Profile = Profile.builder()
            .name(BAZ_PROFILE_NAME)
            .properties(
                mapOf(
                    CREDENTIAL_PROCESS to BAZ_CREDENTIAL_PROCESS
                )
            )
            .build()
    }
}
