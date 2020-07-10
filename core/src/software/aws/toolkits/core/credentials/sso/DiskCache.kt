// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.credentials.sso

import com.fasterxml.jackson.core.JsonParser
import com.fasterxml.jackson.databind.DeserializationContext
import com.fasterxml.jackson.databind.DeserializationFeature
import com.fasterxml.jackson.databind.deser.std.StdDeserializer
import com.fasterxml.jackson.databind.module.SimpleModule
import com.fasterxml.jackson.databind.util.StdDateFormat
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import software.aws.toolkits.core.utils.deleteIfExists
import software.aws.toolkits.core.utils.filePermissions
import software.aws.toolkits.core.utils.inputStreamIfExists
import software.aws.toolkits.core.utils.outputStream
import software.aws.toolkits.core.utils.toHexString
import software.aws.toolkits.core.utils.touch
import software.aws.toolkits.core.utils.tryOrNull
import java.nio.file.Path
import java.nio.file.Paths
import java.nio.file.attribute.PosixFilePermission
import java.security.MessageDigest
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter.ISO_INSTANT
import java.time.temporal.ChronoUnit
import java.util.TimeZone

/**
 * Caches the [AccessToken] to disk to allow it to be re-used with other tools such as the CLI.
 */
class DiskCache(
    private val cacheDir: Path = Paths.get(System.getProperty("user.home"), ".aws", "sso", "cache"),
    private val clock: Clock = Clock.systemUTC()
) : SsoCache {
    private val objectMapper = jacksonObjectMapper().also {
        it.disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)

        it.registerModule(JavaTimeModule())
        val customDateModule = SimpleModule()
        customDateModule.addDeserializer(Instant::class.java, CliCompatibleInstantDeserializer())
        it.registerModule(customDateModule) // Override the Instant deserializer with custom one
        it.dateFormat = StdDateFormat().withTimeZone(TimeZone.getTimeZone(ZoneOffset.UTC))
    }

    override fun loadClientRegistration(ssoRegion: String): ClientRegistration? {
        val inputStream = clientRegistrationCache(ssoRegion).inputStreamIfExists() ?: return null
        return tryOrNull {
            val clientRegistration = objectMapper.readValue<ClientRegistration>(inputStream)
            if (clientRegistration.expiresAt.isNotExpired()) {
                clientRegistration
            } else {
                null
            }
        }
    }

    override fun saveClientRegistration(ssoRegion: String, registration: ClientRegistration) {
        val registrationCache = clientRegistrationCache(ssoRegion)
        registrationCache.touch()
        registrationCache.filePermissions(setOf(PosixFilePermission.OWNER_READ, PosixFilePermission.OWNER_WRITE))

        registrationCache.outputStream().use {
            objectMapper.writeValue(it, registration)
        }
    }

    override fun invalidateClientRegistration(ssoRegion: String) {
        clientRegistrationCache(ssoRegion).deleteIfExists()
    }

    override fun loadAccessToken(ssoUrl: String): AccessToken? {
        val cacheFile = accessTokenCache(ssoUrl)
        val inputStream = cacheFile.inputStreamIfExists() ?: return null

        return tryOrNull {
            val clientRegistration = objectMapper.readValue<AccessToken>(inputStream)
            // Use same expiration logic as client registration even though RFC/SEP does not specify it.
            // This prevents a cache entry being returned as valid and then expired when we go to use it.
            if (clientRegistration.expiresAt.isNotExpired()) {
                clientRegistration
            } else {
                null
            }
        }
    }

    override fun saveAccessToken(ssoUrl: String, accessToken: AccessToken) {
        val accessTokenCache = accessTokenCache(ssoUrl)
        accessTokenCache.touch()
        accessTokenCache.filePermissions(setOf(PosixFilePermission.OWNER_READ, PosixFilePermission.OWNER_WRITE))

        accessTokenCache.outputStream().use {
            objectMapper.writeValue(it, accessToken)
        }
    }

    override fun invalidateAccessToken(ssoUrl: String) {
        accessTokenCache(ssoUrl).deleteIfExists()
    }

    private fun clientRegistrationCache(ssoRegion: String): Path = cacheDir.resolve("aws-toolkit-jetbrains-client-id-$ssoRegion.json")

    private fun accessTokenCache(ssoUrl: String): Path {
        val digest = MessageDigest.getInstance("SHA-1")
        val sha = digest.digest(ssoUrl.toByteArray(Charsets.UTF_8)).toHexString()
        val fileName = "$sha.json"
        return cacheDir.resolve(fileName)
    }

    // If the item is going to expire in the next 15 mins, we must treat it as already expired
    private fun Instant.isNotExpired(): Boolean = this.isAfter(Instant.now(clock).plus(15, ChronoUnit.MINUTES))

    private class CliCompatibleInstantDeserializer : StdDeserializer<Instant>(Instant::class.java) {
        override fun deserialize(parser: JsonParser, context: DeserializationContext): Instant {
            val dateString = parser.valueAsString

            // CLI appends UTC, which Java refuses to parse. Convert it to a Z
            val sanitized = if (dateString.endsWith("UTC")) {
                dateString.dropLast(3) + 'Z'
            } else {
                dateString
            }

            return ISO_INSTANT.parse(sanitized) { Instant.from(it) }
        }
    }
}
