// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.sso

import com.intellij.openapi.util.SystemInfo
import com.intellij.openapi.util.io.NioFiles
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.condition.DisabledOnOs
import org.junit.jupiter.api.condition.OS
import org.junit.jupiter.api.io.TempDir
import software.aws.toolkits.core.utils.readText
import software.aws.toolkits.core.utils.writeText
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.Paths
import java.nio.file.attribute.PosixFilePermissions
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import kotlin.io.path.setPosixFilePermissions

class DiskCacheTest {
    private val now = Instant.now()
    private val clock = Clock.fixed(now, ZoneOffset.UTC)

    private val ssoUrl = "https://123456.awsapps.com/start"
    private val ssoRegion = "us-fake-1"
    private val scopes = listOf("scope1", "scope2")

    private lateinit var cacheRoot: Path
    private lateinit var cacheLocation: Path
    private lateinit var sut: DiskCache

    @BeforeEach
    fun setUp(@TempDir tempFolder: Path) {
        cacheRoot = tempFolder.toAbsolutePath()
        cacheLocation = Paths.get(cacheRoot.toString(), "fakehome", ".aws", "sso", "cache")
        Files.createDirectories(cacheLocation)
        sut = DiskCache(cacheLocation, clock)
    }

    @Test
    fun nonExistentClientRegistrationReturnsNull() {
        assertThat(sut.loadClientRegistration(ssoRegion)).isNull()
    }

    @Test
    fun corruptClientRegistrationReturnsNull() {
        cacheLocation.resolve("aws-toolkit-jetbrains-client-id-$ssoRegion.json").writeText("badData")

        assertThat(sut.loadClientRegistration(ssoRegion)).isNull()
    }

    @Test
    fun expiredClientRegistrationReturnsNull() {
        cacheLocation.resolve("aws-toolkit-jetbrains-client-id-$ssoRegion.json").writeText(
            """
            {
                "clientId": "DummyId", 
                "clientSecret": "DummySecret", 
                "expiresAt": "${DateTimeFormatter.ISO_INSTANT.format(now.minusSeconds(100))}"
            }
            """.trimIndent()
        )

        assertThat(sut.loadClientRegistration(ssoRegion)).isNull()
    }

    @Test
    fun clientRegistrationExpiringSoonIsTreatedAsExpired() {
        val expirationTime = now.plus(14, ChronoUnit.MINUTES)
        cacheLocation.resolve("aws-toolkit-jetbrains-client-id-$ssoRegion.json").writeText(
            """
            {
                "clientId": "DummyId", 
                "clientSecret": "DummySecret", 
                "expiresAt": "${DateTimeFormatter.ISO_INSTANT.format(expirationTime)}"
            }
            """.trimIndent()
        )

        assertThat(sut.loadClientRegistration(ssoRegion)).isNull()
    }

    @Test
    fun validClientRegistrationReturnsCorrectly() {
        val expirationTime = now.plus(20, ChronoUnit.MINUTES)
        cacheLocation.resolve("aws-toolkit-jetbrains-client-id-$ssoRegion.json").writeText(
            """
            {
                "clientId": "DummyId", 
                "clientSecret": "DummySecret", 
                "expiresAt": "${DateTimeFormatter.ISO_INSTANT.format(expirationTime)}"
            }
            """.trimIndent()
        )

        assertThat(sut.loadClientRegistration(ssoRegion))
            .usingRecursiveComparison()
            .isEqualTo(
                ClientRegistration(
                    "DummyId",
                    "DummySecret",
                    expirationTime
                )
            )
    }

    @Test
    fun `valid scoped client registration loads correctly`() {
        val key = ClientRegistrationCacheKey(
            startUrl = ssoUrl,
            scopes = scopes,
            region = ssoRegion
        )
        val expirationTime = now.plus(20, ChronoUnit.MINUTES)
        cacheLocation.resolve("223224b6f0b4702c1a984be8284fe2c9d9718759.json").writeText(
            """
            {
                "clientId": "DummyId", 
                "clientSecret": "DummySecret", 
                "expiresAt": "${DateTimeFormatter.ISO_INSTANT.format(expirationTime)}",
                "scopes": ["scope1","scope2"]
            }
            """.trimIndent()
        )

        assertThat(sut.loadClientRegistration(key))
            .usingRecursiveComparison()
            .isEqualTo(
                ClientRegistration(
                    "DummyId",
                    "DummySecret",
                    expirationTime,
                    scopes
                )
            )
    }

    @Test
    fun clientRegistrationSavesCorrectly() {
        val expirationTime = DateTimeFormatter.ISO_INSTANT.parse("2020-04-07T21:31:33Z")
        sut.saveClientRegistration(
            ssoRegion,
            ClientRegistration(
                "DummyId",
                "DummySecret",
                Instant.from(expirationTime)
            )
        )

        val clientRegistration = cacheLocation.resolve("aws-toolkit-jetbrains-client-id-$ssoRegion.json")
        if (SystemInfo.isUnix) {
            assertPosixPermissions(clientRegistration, "rw-------")
        }
        assertThat(clientRegistration.readText())
            .isEqualToIgnoringWhitespace(
                """
                {
                    "clientId": "DummyId", 
                    "clientSecret": "DummySecret", 
                    "expiresAt": "2020-04-07T21:31:33Z"
                }       
                """.trimIndent()
            )
    }

    @Test
    fun `scoped client registration saves correctly`() {
        val key = ClientRegistrationCacheKey(
            startUrl = ssoUrl,
            scopes = scopes,
            region = ssoRegion
        )
        val expirationTime = DateTimeFormatter.ISO_INSTANT.parse("2020-04-07T21:31:33Z")
        sut.saveClientRegistration(
            key,
            ClientRegistration(
                "DummyId",
                "DummySecret",
                Instant.from(expirationTime),
                scopes
            )
        )

        val clientRegistration = cacheLocation.resolve("223224b6f0b4702c1a984be8284fe2c9d9718759.json")
        if (SystemInfo.isUnix) {
            assertPosixPermissions(clientRegistration, "rw-------")
        }
        assertThat(clientRegistration.readText())
            .isEqualToIgnoringWhitespace(
                """
                {
                    "clientId": "DummyId", 
                    "clientSecret": "DummySecret", 
                    "expiresAt": "2020-04-07T21:31:33Z",
                    "scopes": ["scope1","scope2"]
                }       
                """.trimIndent()
            )
    }

    @Test
    fun invalidateClientRegistrationDeletesTheFile() {
        val expirationTime = now.plus(20, ChronoUnit.MINUTES)
        val cacheFile = cacheLocation.resolve("aws-toolkit-jetbrains-client-id-$ssoRegion.json")
        cacheFile.writeText(
            """
            {
                "clientId": "DummyId", 
                "clientSecret": "DummySecret", 
                "expiresAt": "${DateTimeFormatter.ISO_INSTANT.format(expirationTime)}"
            }
            """.trimIndent()
        )

        assertThat(sut.loadClientRegistration(ssoRegion)).isNotNull()

        sut.invalidateClientRegistration(ssoRegion)

        assertThat(sut.loadClientRegistration(ssoRegion)).isNull()
        assertThat(cacheFile).doesNotExist()
    }

    @Test
    fun `invalidate scoped client registration deletes the file`() {
        val expirationTime = now.plus(20, ChronoUnit.MINUTES)
        val cacheFile = cacheLocation.resolve("223224b6f0b4702c1a984be8284fe2c9d9718759.json")
        cacheFile.writeText(
            """
            {
                "clientId": "DummyId", 
                "clientSecret": "DummySecret", 
                "expiresAt": "${DateTimeFormatter.ISO_INSTANT.format(expirationTime)}"
            }
            """.trimIndent()
        )

        val key = ClientRegistrationCacheKey(
            startUrl = ssoUrl,
            scopes = scopes,
            region = ssoRegion
        )

        assertThat(sut.loadClientRegistration(key)).isNotNull()

        sut.invalidateClientRegistration(key)

        assertThat(sut.loadClientRegistration(key)).isNull()
        assertThat(cacheFile).doesNotExist()
    }

    @Test
    fun nonExistentAccessTokenReturnsNull() {
        assertThat(sut.loadAccessToken(ssoUrl)).isNull()
    }

    @Test
    fun corruptAccessTokenReturnsNull() {
        cacheLocation.resolve("c1ac99f782ad92755c6de8647b510ec247330ad1.json").writeText("badData")

        assertThat(sut.loadAccessToken(ssoUrl)).isNull()
    }

    @Test
    fun `expired access token is not loaded`() {
        cacheLocation.resolve("c1ac99f782ad92755c6de8647b510ec247330ad1.json").writeText(
            """
            {
                "startUrl": "$ssoUrl", 
                "region": "$ssoRegion",
                "accessToken": "DummyAccessToken",
                "expiresAt": "${DateTimeFormatter.ISO_INSTANT.format(now.minusSeconds(100))}",
            }
            """.trimIndent()
        )

        assertThat(sut.loadAccessToken(ssoUrl)).isNull()
    }

    @Test
    fun `expired access token is loaded if it has a refresh token`() {
        cacheLocation.resolve("c1ac99f782ad92755c6de8647b510ec247330ad1.json").writeText(
            """
            {
                "startUrl": "$ssoUrl", 
                "region": "$ssoRegion",
                "accessToken": "DummyAccessToken",
                "refreshToken": "ARefreshToken",
                "expiresAt": "${DateTimeFormatter.ISO_INSTANT.format(now.minusSeconds(100))}"
            }
            """.trimIndent()
        )

        assertThat(sut.loadAccessToken(ssoUrl)).isNotNull()
    }

    @Test
    fun accessTokenExpiringSoonIsTreatedAsExpired() {
        val expirationTime = now.plus(14, ChronoUnit.MINUTES)
        cacheLocation.resolve("c1ac99f782ad92755c6de8647b510ec247330ad1.json").writeText(
            """
            {
                "startUrl": "$ssoUrl", 
                "region": "$ssoRegion",
                "accessToken": "DummyAccessToken",
                "expiresAt": "${DateTimeFormatter.ISO_INSTANT.format(expirationTime)}"
            }
            """.trimIndent()
        )

        assertThat(sut.loadAccessToken(ssoUrl)).isNull()
    }

    @Test
    fun validAccessTokenReturnsCorrectly() {
        val expirationTime = now.plus(20, ChronoUnit.MINUTES)
        cacheLocation.resolve("c1ac99f782ad92755c6de8647b510ec247330ad1.json").writeText(
            """
            {
                "startUrl": "$ssoUrl", 
                "region": "$ssoRegion",
                "accessToken": "DummyAccessToken",
                "expiresAt": "${DateTimeFormatter.ISO_INSTANT.format(expirationTime)}"
            }
            """.trimIndent()
        )

        assertThat(sut.loadAccessToken(ssoUrl))
            .usingRecursiveComparison()
            .isEqualTo(
                AccessToken(
                    ssoUrl,
                    ssoRegion,
                    "DummyAccessToken",
                    expiresAt = expirationTime
                )
            )
    }

    @Test
    fun validAccessTokenFromCliReturnsCorrectly() {
        cacheLocation.resolve("c1ac99f782ad92755c6de8647b510ec247330ad1.json").writeText(
            """
            {
                "startUrl": "$ssoUrl", 
                "region": "$ssoRegion",
                "accessToken": "DummyAccessToken",
                "expiresAt": "2999-06-10T00:50:40UTC"
            }
            """.trimIndent()
        )

        assertThat(sut.loadAccessToken(ssoUrl))
            .usingRecursiveComparison()
            .isEqualTo(
                AccessToken(
                    ssoUrl,
                    ssoRegion,
                    "DummyAccessToken",
                    expiresAt = ZonedDateTime.of(2999, 6, 10, 0, 50, 40, 0, ZoneOffset.UTC).toInstant()
                )
            )
    }

    @Test
    fun accessTokenSavesCorrectly() {
        val expirationTime = DateTimeFormatter.ISO_INSTANT.parse("2020-04-07T21:31:33Z")
        sut.saveAccessToken(
            ssoUrl,
            AccessToken(
                ssoUrl,
                ssoRegion,
                "DummyAccessToken",
                expiresAt = Instant.from(expirationTime),
                createdAt = Instant.EPOCH
            )
        )

        val accessTokenCache = cacheLocation.resolve("c1ac99f782ad92755c6de8647b510ec247330ad1.json")
        if (SystemInfo.isUnix) {
            assertPosixPermissions(accessTokenCache, "rw-------")
        }

        assertThat(accessTokenCache.readText())
            .isEqualToIgnoringWhitespace(
                """
                {
                    "startUrl": "$ssoUrl", 
                    "region": "$ssoRegion",
                    "accessToken": "DummyAccessToken",
                    "expiresAt": "2020-04-07T21:31:33Z",
                    "createdAt":"1970-01-01T00:00:00Z"
                }       
                """.trimIndent()
            )
    }

    @Test
    fun `scoped access token saves correctly`() {
        val key = AccessTokenCacheKey("connectionId", ssoUrl, listOf("scope1", "scope2"))
        val expirationTime = DateTimeFormatter.ISO_INSTANT.parse("2020-04-07T21:31:33Z")
        sut.saveAccessToken(
            key,
            AccessToken(
                ssoUrl,
                ssoRegion,
                "DummyAccessToken",
                "RefreshToken",
                Instant.from(expirationTime)
            )
        )

        val accessTokenCache = cacheLocation.resolve("72286fb950f12c77c840239851fd64ac60275c5c.json")
        if (SystemInfo.isUnix) {
            assertPosixPermissions(accessTokenCache, "rw-------")
        }

        assertThat(accessTokenCache.readText())
            .isEqualToIgnoringWhitespace(
                """
                {
                    "startUrl": "$ssoUrl", 
                    "region": "$ssoRegion",
                    "accessToken": "DummyAccessToken",
                    "refreshToken": "RefreshToken",
                    "expiresAt": "2020-04-07T21:31:33Z",
                    "createdAt":"1970-01-01T00:00:00Z"
                }       
                """.trimIndent()
            )
    }

    @Test
    fun accessTokenInvalidationDeletesFile() {
        val expirationTime = now.plus(20, ChronoUnit.MINUTES)
        val cacheFile = cacheLocation.resolve("c1ac99f782ad92755c6de8647b510ec247330ad1.json")
        cacheFile.writeText(
            """
            {
                "startUrl": "$ssoUrl", 
                "region": "$ssoRegion",
                "accessToken": "DummyAccessToken",
                "expiresAt": "${DateTimeFormatter.ISO_INSTANT.format(expirationTime)}",
                "createdAt":"1970-01-01T00:00:00Z"
            }
            """.trimIndent()
        )

        assertThat(sut.loadAccessToken(ssoUrl)).isNotNull()

        sut.invalidateAccessToken(ssoUrl)

        assertThat(sut.loadAccessToken(ssoUrl)).isNull()
        assertThat(cacheFile).doesNotExist()
    }

    @Test
    fun `invalidate scoped access token deletes file`() {
        val expirationTime = now.plus(20, ChronoUnit.MINUTES)
        val cacheFile = cacheLocation.resolve("72286fb950f12c77c840239851fd64ac60275c5c.json")
        val key = AccessTokenCacheKey("connectionId", ssoUrl, listOf("scope1", "scope2"))

        cacheFile.writeText(
            """
            {
                "startUrl": "$ssoUrl", 
                "region": "$ssoRegion",
                "accessToken": "DummyAccessToken",
                "expiresAt": "${DateTimeFormatter.ISO_INSTANT.format(expirationTime)}",
                "createdAt":"1970-01-01T00:00:00Z"
            }
            """.trimIndent()
        )

        assertThat(sut.loadAccessToken(key)).isNotNull()

        sut.invalidateAccessToken(key)

        assertThat(sut.loadAccessToken(key)).isNull()
        assertThat(cacheFile).doesNotExist()
    }

    @Test
    fun `scope order does not matter for scoped access token cache`() {
        val expirationTime = now.plus(20, ChronoUnit.MINUTES)
        val cacheFile = cacheLocation.resolve("72286fb950f12c77c840239851fd64ac60275c5c.json")
        val key1 = AccessTokenCacheKey("connectionId", ssoUrl, listOf("scope1", "scope2"))
        val key2 = AccessTokenCacheKey("connectionId", ssoUrl, listOf("scope2", "scope1"))

        cacheFile.writeText(
            """
            {
                "startUrl": "$ssoUrl", 
                "region": "$ssoRegion",
                "accessToken": "DummyAccessToken",
                "expiresAt": "${DateTimeFormatter.ISO_INSTANT.format(expirationTime)}",
                "createdAt":"1970-01-01T00:00:00Z"
            }
            """.trimIndent()
        )

        assertThat(sut.loadAccessToken(key1)).isNotNull()
        assertThat(sut.loadAccessToken(key2)).isNotNull()
    }

    @Test
    @DisabledOnOs(OS.WINDOWS)
    fun `handles error saving client registration when user home is not writable`() {
        Files.newDirectoryStream(cacheRoot).forEach { NioFiles.deleteRecursively(it) }
        cacheRoot.resolve("fakehome").apply {
            Files.createDirectory(this)
            setPosixFilePermissions(emptySet())
        }
        cacheRoot.setPosixFilePermissions(PosixFilePermissions.fromString("r-xr-xr-x"))

        sut.saveClientRegistration(
            ssoRegion,
            ClientRegistration(
                "DummyId",
                "DummySecret",
                Instant.now()
            )
        )

        val registration = cacheLocation.resolve("aws-toolkit-jetbrains-client-id-$ssoRegion.json")
        assertThat(cacheLocation).isEqualTo(Paths.get(cacheRoot.toString(), "fakehome", ".aws", "sso", "cache"))
        assertPosixPermissions(cacheRoot, "rwxr-xr-x")
        assertPosixPermissions(cacheRoot.resolve("fakehome"), "rwx------")
        assertPosixPermissions(cacheRoot.resolve("fakehome").resolve(".aws"), "rwxr-xr-x")
        assertPosixPermissions(cacheRoot.resolve("fakehome").resolve(".aws").resolve("sso"), "rwxr-xr-x")
        assertPosixPermissions(cacheRoot.resolve("fakehome").resolve(".aws").resolve("sso").resolve("cache"), "rwxr-xr-x")
        assertPosixPermissions(registration, "rw-------")
    }

    @Test
    @DisabledOnOs(OS.WINDOWS)
    fun `handles error saving client registration when client registration is not writable`() {
        val registration = cacheLocation.resolve("aws-toolkit-jetbrains-client-id-$ssoRegion.json")
        sut.saveClientRegistration(
            ssoRegion,
            ClientRegistration(
                "DummyId",
                "DummySecret",
                Instant.now()
            )
        )

        registration.setPosixFilePermissions(emptySet())
        assertPosixPermissions(registration, "---------")

        sut.saveClientRegistration(
            ssoRegion,
            ClientRegistration(
                "DummyId",
                "DummySecret",
                Instant.now()
            )
        )

        assertPosixPermissions(registration, "rw-------")
    }

    @Test
    @DisabledOnOs(OS.WINDOWS)
    fun `handles reading client registration when file is owned but not readable`() {
        sut.saveClientRegistration(
            ssoRegion,
            ClientRegistration(
                "DummyId",
                "DummySecret",
                Instant.MAX
            )
        )
        val registration = cacheLocation.resolve("aws-toolkit-jetbrains-client-id-$ssoRegion.json")
        registration.setPosixFilePermissions(emptySet())
        assertPosixPermissions(registration, "---------")

        assertThat(sut.loadClientRegistration(ssoRegion)).isNotNull()

        assertPosixPermissions(registration, "rw-------")
    }

    private fun assertPosixPermissions(path: Path, expected: String) {
        val perms = PosixFilePermissions.toString(Files.getPosixFilePermissions(path))
        assertThat(perms).isEqualTo(expected)
    }
}
