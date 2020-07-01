// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.credentials.sso

import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import software.aws.toolkits.core.region.aRegionId
import software.aws.toolkits.core.utils.readText
import software.aws.toolkits.core.utils.writeText
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.attribute.PosixFilePermission
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit

class DiskCacheTest {
    @Rule
    @JvmField
    val tempFolder = TemporaryFolder()

    private val now = Instant.now()
    private val clock = Clock.fixed(now, ZoneOffset.UTC)

    private val ssoUrl = "https://123456.awsapps.com/start"
    private val ssoRegion = aRegionId()

    private lateinit var cacheLocation: Path
    private lateinit var sut: DiskCache

    @Before
    fun setUp() {
        cacheLocation = tempFolder.newFolder().toPath()
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
        val expiationTime = now.plus(14, ChronoUnit.MINUTES)
        cacheLocation.resolve("aws-toolkit-jetbrains-client-id-$ssoRegion.json").writeText(
            """
            {
                "clientId": "DummyId", 
                "clientSecret": "DummySecret", 
                "expiresAt": "${DateTimeFormatter.ISO_INSTANT.format(expiationTime)}"
            }
            """.trimIndent()
        )

        assertThat(sut.loadClientRegistration(ssoRegion)).isNull()
    }

    @Test
    fun validClientRegistrationReturnsCorrectly() {
        val expiationTime = now.plus(20, ChronoUnit.MINUTES)
        cacheLocation.resolve("aws-toolkit-jetbrains-client-id-$ssoRegion.json").writeText(
            """
            {
                "clientId": "DummyId", 
                "clientSecret": "DummySecret", 
                "expiresAt": "${DateTimeFormatter.ISO_INSTANT.format(expiationTime)}"
            }
            """.trimIndent()
        )

        assertThat(sut.loadClientRegistration(ssoRegion))
            .usingRecursiveComparison()
            .isEqualTo(
                ClientRegistration(
                    "DummyId",
                    "DummySecret",
                    expiationTime
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
        if (isUnix()) {
            assertThat(Files.getPosixFilePermissions(clientRegistration)).containsOnly(PosixFilePermission.OWNER_WRITE, PosixFilePermission.OWNER_READ)
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
    fun invalidateClientRegistrationDeletesTheFile() {
        val expiationTime = now.plus(20, ChronoUnit.MINUTES)
        val cacheFile = cacheLocation.resolve("aws-toolkit-jetbrains-client-id-$ssoRegion.json")
        cacheFile.writeText(
            """
            {
                "clientId": "DummyId", 
                "clientSecret": "DummySecret", 
                "expiresAt": "${DateTimeFormatter.ISO_INSTANT.format(expiationTime)}"
            }
            """.trimIndent()
        )

        assertThat(sut.loadClientRegistration(ssoRegion)).isNotNull

        sut.invalidateClientRegistration(ssoRegion)

        assertThat(sut.loadClientRegistration(ssoRegion)).isNull()
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
    fun expiredAccessTokenReturnsNull() {
        cacheLocation.resolve("c1ac99f782ad92755c6de8647b510ec247330ad1.json").writeText(
            """
            {
                "clientId": "$ssoUrl", 
                "clientSecret": "$ssoRegion",
                "clientSecret": "DummyAccessToken",
                "expiresAt": "${DateTimeFormatter.ISO_INSTANT.format(now.minusSeconds(100))}"
            }
            """.trimIndent()
        )

        assertThat(sut.loadAccessToken(ssoUrl)).isNull()
    }

    @Test
    fun accessTokenExpiringSoonIsTreatedAsExpired() {
        val expiationTime = now.plus(14, ChronoUnit.MINUTES)
        cacheLocation.resolve("c1ac99f782ad92755c6de8647b510ec247330ad1.json").writeText(
            """
            {
                "startUrl": "$ssoUrl", 
                "region": "$ssoRegion",
                "accessToken": "DummyAccessToken",
                "expiresAt": "${DateTimeFormatter.ISO_INSTANT.format(expiationTime)}"
            }
            """.trimIndent()
        )

        assertThat(sut.loadAccessToken(ssoUrl)).isNull()
    }

    @Test
    fun validAccessTokenReturnsCorrectly() {
        val expiationTime = now.plus(20, ChronoUnit.MINUTES)
        cacheLocation.resolve("c1ac99f782ad92755c6de8647b510ec247330ad1.json").writeText(
            """
            {
                "startUrl": "$ssoUrl", 
                "region": "$ssoRegion",
                "accessToken": "DummyAccessToken",
                "expiresAt": "${DateTimeFormatter.ISO_INSTANT.format(expiationTime)}"
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
                    expiationTime
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
                    ZonedDateTime.of(2999, 6, 10, 0, 50, 40, 0, ZoneOffset.UTC).toInstant()
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
                Instant.from(expirationTime)
            )
        )

        val accessTokenCache = cacheLocation.resolve("c1ac99f782ad92755c6de8647b510ec247330ad1.json")
        if (isUnix()) {
            assertThat(Files.getPosixFilePermissions(accessTokenCache)).containsOnly(PosixFilePermission.OWNER_WRITE, PosixFilePermission.OWNER_READ)
        }

        assertThat(accessTokenCache.readText())
            .isEqualToIgnoringWhitespace(
                """
                {
                    "startUrl": "$ssoUrl", 
                    "region": "$ssoRegion",
                    "accessToken": "DummyAccessToken",
                    "expiresAt": "2020-04-07T21:31:33Z"
                }       
                """.trimIndent()
            )
    }

    @Test
    fun accessTokenInvalidationDeletesFile() {
        val expiationTime = now.plus(20, ChronoUnit.MINUTES)
        val cacheFile = cacheLocation.resolve("c1ac99f782ad92755c6de8647b510ec247330ad1.json")
        cacheFile.writeText(
            """
            {
                "startUrl": "$ssoUrl", 
                "region": "$ssoRegion",
                "accessToken": "DummyAccessToken",
                "expiresAt": "${DateTimeFormatter.ISO_INSTANT.format(expiationTime)}"
            }
            """.trimIndent()
        )

        assertThat(sut.loadAccessToken(ssoUrl)).isNotNull

        sut.invalidateAccessToken(ssoUrl)

        assertThat(sut.loadAccessToken(ssoUrl)).isNull()
        assertThat(cacheFile).doesNotExist()
    }

    private fun isUnix() = !System.getProperty("os.name").toLowerCase().startsWith("windows")
}
