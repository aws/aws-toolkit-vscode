// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.notification.Notifications
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.ui.Messages
import com.intellij.openapi.ui.TestInputDialog
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.util.io.FileUtil
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.testFramework.DisposableRule
import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.VfsTestUtil
import com.nhaarman.mockitokotlin2.any
import com.nhaarman.mockitokotlin2.argumentCaptor
import com.nhaarman.mockitokotlin2.check
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
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials
import software.amazon.awssdk.auth.credentials.AwsSessionCredentials
import software.amazon.awssdk.http.AbortableInputStream
import software.amazon.awssdk.http.ExecutableHttpRequest
import software.amazon.awssdk.http.HttpExecuteRequest
import software.amazon.awssdk.http.HttpExecuteResponse
import software.amazon.awssdk.http.SdkHttpClient
import software.amazon.awssdk.http.SdkHttpFullResponse
import software.aws.toolkits.core.credentials.CredentialsChangeEvent
import software.aws.toolkits.core.credentials.CredentialsChangeListener
import software.aws.toolkits.core.credentials.ToolkitCredentialsIdentifier
import software.aws.toolkits.core.region.ToolkitRegionProvider
import software.aws.toolkits.core.rules.SystemPropertyHelper
import software.aws.toolkits.jetbrains.core.credentials.profiles.ProfileCredentialProviderFactory
import software.aws.toolkits.jetbrains.core.region.MockRegionProvider
import java.io.File
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.time.temporal.TemporalAccessor

class ProfileCredentialProviderFactoryTest {
    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @Rule
    @JvmField
    val temporaryFolder = TemporaryFolder()

    @Rule
    @JvmField
    val systemPropertyHelper = SystemPropertyHelper()

    @Rule
    @JvmField
    val disposableRule = DisposableRule()

    private lateinit var profileFile: File
    private lateinit var credentialsFile: File

    private val mockSdkHttpClient = mock<SdkHttpClient>()
    private val mockRegionProvider = mock<ToolkitRegionProvider>()
    private val profileLoadCallback = mock<CredentialsChangeListener>()
    private val credentialChangeEvent = argumentCaptor<CredentialsChangeEvent>()

    @Before
    fun setUp() {
        reset(mockSdkHttpClient, mockRegionProvider, profileLoadCallback)

        val awsFolder = File(temporaryFolder.root, ".aws")
        profileFile = File(awsFolder, "config")
        credentialsFile = File(awsFolder, "credentials")

        System.getProperties().setProperty("aws.configFile", profileFile.absolutePath)
        System.getProperties().setProperty("aws.sharedCredentialsFile", credentialsFile.absolutePath)

        profileLoadCallback.stub {
            on { profileLoadCallback.invoke(credentialChangeEvent.capture()) }.thenReturn(Unit)
        }

        Messages.setTestInputDialog { MFA_TOKEN }
    }

    @After
    fun tearDown() {
        Messages.setTestInputDialog(TestInputDialog.DEFAULT)
    }

    @Test
    fun testLoadingWithEmptyProfiles() {
        createProviderFactory()
        verify(profileLoadCallback).invoke(
            check {
                assertThat(it.added).isEmpty()
                assertThat(it.modified).isEmpty()
                assertThat(it.removed).isEmpty()
            }
        )
    }

    @Test
    fun testLoadingWithExpectedProfiles() {
        profileFile.writeToFile(TEST_PROFILE_FILE_CONTENTS)

        createProviderFactory()

        verify(profileLoadCallback).invoke(
            check {
                assertThat(it.added).hasSize(3)
                    .has(profileName(FOO_PROFILE_NAME))
                    .has(profileName(BAR_PROFILE_NAME))
                    .has(profileName(BAZ_PROFILE_NAME))

                assertThat(it.modified).isEmpty()
                assertThat(it.removed).isEmpty()
            }
        )
    }

    @Test
    fun testLoadingWithIllegalFormatTriggersANotification() {
        profileFile.writeToFile(
            """
            [profile bar]
            aws_access_key_id
            """.trimIndent()
        )

        val notificationMock = mock<Notifications>()
        ApplicationManager.getApplication().messageBus.connect(disposableRule.disposable).subscribe(Notifications.TOPIC, notificationMock)

        createProviderFactory()

        verify(notificationMock).notify(check {
            assertThat(it.content).contains("Expected an '=' sign defining a property on line 2")
        })
    }

    @Test
    fun oneFailureDoesNotCauseOtherCredentialsToFail() {
        profileFile.writeToFile(
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

        createProviderFactory()
        verify(profileLoadCallback).invoke(
            check {
                assertThat(it.added).hasSize(1).has(profileName("another_profile"))
                assertThat(it.modified).isEmpty()
                assertThat(it.removed).isEmpty()
            }
        )
    }

    @Test
    fun testCreationOfBasicCredentials() {
        profileFile.writeToFile(TEST_PROFILE_FILE_CONTENTS)

        val providerFactory = createProviderFactory()
        val validProfile = findCredentialIdentifier(BAR_PROFILE_NAME)
        val credentialsProvider = providerFactory.createAwsCredentialProvider(
            validProfile,
            MockRegionProvider.getInstance().defaultRegion(),
            mockSdkHttpClient
        ).resolveCredentials()

        assertThat(credentialsProvider).isInstanceOfSatisfying(AwsBasicCredentials::class.java) {
            assertThat(it.accessKeyId()).isEqualTo("BarAccessKey")
            assertThat(it.secretAccessKey()).isEqualTo("BarSecretKey")
        }
    }

    @Test
    fun testCreationOfStaticSessionCredentials() {
        profileFile.writeToFile(TEST_PROFILE_FILE_CONTENTS)

        val providerFactory = createProviderFactory()
        val validProfile = findCredentialIdentifier(FOO_PROFILE_NAME)
        val credentialsProvider = providerFactory.createAwsCredentialProvider(
            validProfile,
            MockRegionProvider.getInstance().defaultRegion(),
            mockSdkHttpClient
        ).resolveCredentials()

        assertThat(credentialsProvider).isInstanceOfSatisfying(AwsSessionCredentials::class.java) {
            assertThat(it.accessKeyId()).isEqualTo("FooAccessKey")
            assertThat(it.secretAccessKey()).isEqualTo("FooSecretKey")
            assertThat(it.sessionToken()).isEqualTo("FooSessionToken")
        }
    }

    @Test
    fun testAssumingRoles() {
        profileFile.writeToFile(
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
        println(credentialChangeEvent.allValues)
        val validProfile = findCredentialIdentifier("role")
        val credentialsProvider = providerFactory.createAwsCredentialProvider(
            validProfile,
            MockRegionProvider.getInstance().defaultRegion(),
            mockSdkHttpClient
        ).resolveCredentials()

        assertThat(credentialsProvider).isInstanceOfSatisfying(AwsSessionCredentials::class.java) {
            assertThat(it.accessKeyId()).isEqualTo("AccessKey")
            assertThat(it.secretAccessKey()).isEqualTo("SecretKey")
            assertThat(it.sessionToken()).isEqualTo("SessionToken")
        }
    }

    @Test
    fun testAssumingRolesMfa() {
        profileFile.writeToFile(
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
        val validProfile = findCredentialIdentifier("role")
        val credentialsProvider = providerFactory.createAwsCredentialProvider(
            validProfile,
            MockRegionProvider.getInstance().defaultRegion(),
            mockSdkHttpClient
        ).resolveCredentials()

        assertThat(credentialsProvider).isInstanceOfSatisfying(AwsSessionCredentials::class.java) {
            assertThat(it.accessKeyId()).isEqualTo("AccessKey")
            assertThat(it.secretAccessKey()).isEqualTo("SecretKey")
            assertThat(it.sessionToken()).isEqualTo("SessionToken")
        }

        val content = captor.firstValue.contentStreamProvider().get().newStream().bufferedReader().use { it.readText() }
        assertThat(content).contains("TokenCode=MfaToken")
            .contains("SerialNumber=someSerialArn")
    }

    @Test
    fun testAssumingRoleChained() {
        profileFile.writeToFile(
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
        val validProfile = findCredentialIdentifier("role")
        val credentialsProvider = providerFactory.createAwsCredentialProvider(
            validProfile,
            MockRegionProvider.getInstance().defaultRegion(),
            mockSdkHttpClient
        ).resolveCredentials()

        assertThat(credentialsProvider).isInstanceOfSatisfying(AwsSessionCredentials::class.java) {
            assertThat(it.accessKeyId()).isEqualTo("AccessKey")
            assertThat(it.secretAccessKey()).isEqualTo("SecretKey")
            assertThat(it.sessionToken()).isEqualTo("SessionToken")
        }

        verify(mockSdkHttpClient, times(2)).prepareRequest(any())
    }

    @Test
    fun testRefreshExistingProfiles() {
        profileFile.writeToFile(
            """
            [profile foo]
            aws_access_key_id=FooAccessKey
            aws_secret_access_key=FooSecretKey
            aws_session_token=FooSessionToken
            """.trimIndent()
        )

        val providerFactory = createProviderFactory()
        val validProfile = findCredentialIdentifier("foo")
        val credentialsProvider = providerFactory.createAwsCredentialProvider(
            validProfile,
            MockRegionProvider.getInstance().defaultRegion(),
            mockSdkHttpClient
        )

        verify(profileLoadCallback).invoke(
            check {
                assertThat(it.added).hasSize(1).has(profileName("foo"))
                assertThat(it.modified).isEmpty()
                assertThat(it.removed).isEmpty()
            }
        )

        assertThat(credentialsProvider.resolveCredentials()).isInstanceOfSatisfying(AwsSessionCredentials::class.java) {
            assertThat(it.accessKeyId()).isEqualTo("FooAccessKey")
            assertThat(it.secretAccessKey()).isEqualTo("FooSecretKey")
            assertThat(it.sessionToken()).isEqualTo("FooSessionToken")
        }

        profileFile.writeToFile(
            """
            [profile foo]
            aws_access_key_id=FooAccessKey2
            aws_secret_access_key=FooSecretKey2
            aws_session_token=FooSessionToken2
            """.trimIndent()
        )

        verify(profileLoadCallback).invoke(
            check {
                assertThat(it.added).isEmpty()
                assertThat(it.modified).hasSize(1).has(profileName("foo"))
                assertThat(it.removed).isEmpty()
            }
        )
    }

    @Test
    fun testRefreshDeletesProfiles() {
        profileFile.writeToFile(
            """
            [profile foo]
            aws_access_key_id=FooAccessKey
            aws_secret_access_key=FooSecretKey
            aws_session_token=FooSessionToken
            """.trimIndent()
        )

        val providerFactory = createProviderFactory()
        val validProfile = findCredentialIdentifier("foo")
        val credentialsProvider = providerFactory.createAwsCredentialProvider(
            validProfile,
            MockRegionProvider.getInstance().defaultRegion(),
            mockSdkHttpClient
        )

        assertThat(credentialsProvider.resolveCredentials()).isInstanceOfSatisfying(AwsSessionCredentials::class.java) {
            assertThat(it.accessKeyId()).isEqualTo("FooAccessKey")
            assertThat(it.secretAccessKey()).isEqualTo("FooSecretKey")
            assertThat(it.sessionToken()).isEqualTo("FooSessionToken")
        }

        profileFile.writeToFile("")

        assertThatThrownBy {
            providerFactory.createAwsCredentialProvider(validProfile, MockRegionProvider.getInstance().defaultRegion(), mockSdkHttpClient)
        }.isInstanceOf(IllegalStateException::class.java)

        verify(profileLoadCallback).invoke(
            check {
                assertThat(it.added).isEmpty()
                assertThat(it.modified).isEmpty()
                assertThat(it.removed).hasSize(1).has(profileName("foo"))
            }
        )
    }

    @Test
    fun testRefreshAddsProfiles() {
        profileFile.writeToFile("")

        val providerFactory = createProviderFactory()

        verify(profileLoadCallback).invoke(
            check {
                assertThat(it.added).isEmpty()
                assertThat(it.modified).isEmpty()
                assertThat(it.removed).isEmpty()
            }
        )

        profileFile.writeToFile(
            """
            [profile foo]
            aws_access_key_id=FooAccessKey
            aws_secret_access_key=FooSecretKey
            aws_session_token=FooSessionToken
            """.trimIndent()
        )

        val validProfile = findCredentialIdentifier("foo")
        val credentialsProvider = providerFactory.createAwsCredentialProvider(
            validProfile,
            MockRegionProvider.getInstance().defaultRegion(),
            mockSdkHttpClient
        )

        assertThat(credentialsProvider.resolveCredentials()).isInstanceOfSatisfying(AwsSessionCredentials::class.java) {
            assertThat(it.accessKeyId()).isEqualTo("FooAccessKey")
            assertThat(it.secretAccessKey()).isEqualTo("FooSecretKey")
            assertThat(it.sessionToken()).isEqualTo("FooSessionToken")
        }

        verify(profileLoadCallback).invoke(
            check {
                assertThat(it.added).hasSize(1).has(profileName("foo"))
                assertThat(it.modified).isEmpty()
                assertThat(it.removed).isEmpty()
            }
        )
    }

    @Test
    fun testProfileFileIsCreated() {
        assertThat(profileFile).doesNotExist()

        val providerFactory = createProviderFactory()

        verify(profileLoadCallback).invoke(
            check {
                assertThat(it.added).isEmpty()
                assertThat(it.modified).isEmpty()
                assertThat(it.removed).isEmpty()
            }
        )

        profileFile.writeToFile(
            """
            [profile foo]
            aws_access_key_id=FooAccessKey
            aws_secret_access_key=FooSecretKey
            aws_session_token=FooSessionToken
            """.trimIndent()
        )

        verify(profileLoadCallback).invoke(
            check {
                assertThat(it.added).hasSize(1).has(profileName("foo"))
                assertThat(it.modified).isEmpty()
                assertThat(it.removed).isEmpty()
            }
        )

        val validProfile = findCredentialIdentifier("foo")
        val credentialsProvider = providerFactory.createAwsCredentialProvider(
            validProfile,
            MockRegionProvider.getInstance().defaultRegion(),
            mockSdkHttpClient
        )

        assertThat(credentialsProvider.resolveCredentials()).isInstanceOfSatisfying(AwsSessionCredentials::class.java) {
            assertThat(it.accessKeyId()).isEqualTo("FooAccessKey")
            assertThat(it.secretAccessKey()).isEqualTo("FooSecretKey")
            assertThat(it.sessionToken()).isEqualTo("FooSessionToken")
        }
    }

    @Test
    fun testRefreshDeleteProfileFile() {
        profileFile.writeToFile(
            """
            [profile foo]
            aws_access_key_id=FooAccessKey
            aws_secret_access_key=FooSecretKey
            aws_session_token=FooSessionToken
            """.trimIndent()
        )

        val providerFactory = createProviderFactory()
        val validProfile = findCredentialIdentifier("foo")
        val credentialsProvider = providerFactory.createAwsCredentialProvider(
            validProfile,
            MockRegionProvider.getInstance().defaultRegion(),
            mockSdkHttpClient
        )

        assertThat(credentialsProvider.resolveCredentials()).isInstanceOfSatisfying(AwsSessionCredentials::class.java) {
            assertThat(it.accessKeyId()).isEqualTo("FooAccessKey")
            assertThat(it.secretAccessKey()).isEqualTo("FooSecretKey")
            assertThat(it.sessionToken()).isEqualTo("FooSessionToken")
        }

        VfsTestUtil.deleteFile(LocalFileSystem.getInstance().findFileByIoFile(profileFile)!!)

        assertThatThrownBy {
            providerFactory.createAwsCredentialProvider(validProfile, MockRegionProvider.getInstance().defaultRegion(), mockSdkHttpClient)
        }.isInstanceOf(IllegalStateException::class.java)

        verify(profileLoadCallback).invoke(
            check {
                assertThat(it.added).isEmpty()
                assertThat(it.modified).isEmpty()
                assertThat(it.removed).hasSize(1).has(profileName("foo"))
            }
        )
    }

    private fun File.writeToFile(content: String) {
        WriteCommandAction.runWriteCommandAction(projectRule.project) {
            FileUtil.createIfDoesntExist(this)
            val virtualFile = LocalFileSystem.getInstance().refreshAndFindFileByIoFile(this)!!
            VfsUtil.saveText(virtualFile, content)
        }
    }

    private fun profileName(expectedProfileName: String): Condition<Iterable<ToolkitCredentialsIdentifier>> =
        object : Condition<Iterable<ToolkitCredentialsIdentifier>>(expectedProfileName) {
            override fun matches(value: Iterable<ToolkitCredentialsIdentifier>): Boolean = value.any {
                it.id == "profile:$expectedProfileName"
            }
        }

    private fun createProviderFactory(): ProfileCredentialProviderFactory {
        val factory = ProfileCredentialProviderFactory()
        factory.setUp(profileLoadCallback)

        Disposer.register(disposableRule.disposable, factory)

        return factory
    }

    private fun findCredentialIdentifier(profileName: String) = credentialChangeEvent.allValues.flatMap { it.added }.first { it.id == "profile:$profileName" }

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
                .response(
                    SdkHttpFullResponse.builder()
                        .statusCode(200)
                        .build()
                )
                .responseBody(AbortableInputStream.create(body.toByteArray().inputStream()))
                .build()

            override fun abort() {}
        }
    }

    private companion object {
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

        const val FOO_PROFILE_NAME = "foo"
        const val BAR_PROFILE_NAME = "bar"
        const val BAZ_PROFILE_NAME = "baz"
        const val MFA_TOKEN = "MfaToken"
    }
}
