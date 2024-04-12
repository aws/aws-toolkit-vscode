// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.sso

import com.fasterxml.jackson.core.JsonParser
import com.fasterxml.jackson.databind.BeanProperty
import com.fasterxml.jackson.databind.DeserializationContext
import com.fasterxml.jackson.databind.DeserializationFeature
import com.fasterxml.jackson.databind.JavaType
import com.fasterxml.jackson.databind.JsonSerializer
import com.fasterxml.jackson.databind.SerializationFeature
import com.fasterxml.jackson.databind.SerializerProvider
import com.fasterxml.jackson.databind.deser.std.StdDeserializer
import com.fasterxml.jackson.databind.module.SimpleModule
import com.fasterxml.jackson.databind.node.ObjectNode
import com.fasterxml.jackson.databind.ser.std.StdDelegatingSerializer
import com.fasterxml.jackson.databind.util.Converter
import com.fasterxml.jackson.databind.util.StdConverter
import com.fasterxml.jackson.databind.util.StdDateFormat
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import software.aws.toolkits.core.utils.createParentDirectories
import software.aws.toolkits.core.utils.debug
import software.aws.toolkits.core.utils.deleteIfExists
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.inputStreamIfExists
import software.aws.toolkits.core.utils.outputStream
import software.aws.toolkits.core.utils.toHexString
import software.aws.toolkits.core.utils.touch
import software.aws.toolkits.core.utils.tryDirOp
import software.aws.toolkits.core.utils.tryFileOp
import software.aws.toolkits.core.utils.tryOrNull
import java.io.InputStream
import java.io.OutputStream
import java.nio.file.Path
import java.nio.file.Paths
import java.security.MessageDigest
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter.ISO_INSTANT
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

    // only used for computing cache key names
    private val cacheNameMapper = jacksonObjectMapper()
        .enable(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS)
        .apply {
            // giant dance to automatically sort lists during serialization for deterministic cache keys
            val defaultSerializers = serializerProviderInstance

            class SortedSerializer : StdConverter<List<Comparable<Any>>, List<Comparable<Any>>>() {
                override fun convert(list: List<Comparable<Any>>): List<Comparable<Any>> =
                    list.sorted()
            }

            class DelegatingSerializer : StdDelegatingSerializer(SortedSerializer()) {
                override fun withDelegate(
                    converter: Converter<Any, *>?,
                    delegateType: JavaType?,
                    delegateSerializer: JsonSerializer<*>?
                ): StdDelegatingSerializer =
                    StdDelegatingSerializer(converter, delegateType, delegateSerializer)

                override fun createContextual(provider: SerializerProvider?, property: BeanProperty?): JsonSerializer<*> =
                    // break infinite recursion so we only apply the SortedSerializer once
                    super.createContextual(defaultSerializers, property)
            }

            registerModule(
                SimpleModule().apply {
                    addSerializer(List::class.java, DelegatingSerializer())
                }
            )
        }

    override fun loadClientRegistration(ssoRegion: String): ClientRegistration? {
        LOG.debug { "loadClientRegistration for $ssoRegion" }
        val inputStream = clientRegistrationCache(ssoRegion).tryInputStreamIfExists() ?: return null
        return loadClientRegistration(inputStream)
    }

    override fun saveClientRegistration(ssoRegion: String, registration: ClientRegistration) {
        LOG.debug { "saveClientRegistration for $ssoRegion" }
        val registrationCache = clientRegistrationCache(ssoRegion)
        writeKey(registrationCache) {
            objectMapper.writeValue(it, registration)
        }
    }

    override fun invalidateClientRegistration(ssoRegion: String) {
        LOG.debug { "invalidateClientRegistration for $ssoRegion" }
        clientRegistrationCache(ssoRegion).tryDeleteIfExists()
    }

    override fun loadClientRegistration(cacheKey: ClientRegistrationCacheKey): ClientRegistration? {
        LOG.debug { "loadClientRegistration for $cacheKey" }
        val inputStream = clientRegistrationCache(cacheKey).tryInputStreamIfExists()
            ?: return null

        return loadClientRegistration(inputStream)
    }

    override fun saveClientRegistration(cacheKey: ClientRegistrationCacheKey, registration: ClientRegistration) {
        LOG.debug { "saveClientRegistration for $cacheKey" }
        val registrationCache = clientRegistrationCache(cacheKey)
        writeKey(registrationCache) {
            objectMapper.writeValue(it, registration)
        }
    }

    override fun invalidateClientRegistration(cacheKey: ClientRegistrationCacheKey) {
        LOG.debug { "invalidateClientRegistration for $cacheKey" }
        clientRegistrationCache(cacheKey).tryDeleteIfExists()
    }

    override fun loadAccessToken(ssoUrl: String): AccessToken? {
        LOG.debug { "loadAccessToken for $ssoUrl" }
        val cacheFile = accessTokenCache(ssoUrl)
        val inputStream = cacheFile.tryInputStreamIfExists() ?: return null

        return loadAccessToken(inputStream)
    }

    override fun saveAccessToken(ssoUrl: String, accessToken: AccessToken) {
        LOG.debug { "saveAccessToken for $ssoUrl" }
        val accessTokenCache = accessTokenCache(ssoUrl)
        writeKey(accessTokenCache) {
            objectMapper.writeValue(it, accessToken)
        }
    }

    override fun invalidateAccessToken(ssoUrl: String) {
        LOG.debug { "invalidateAccessToken for $ssoUrl" }
        accessTokenCache(ssoUrl).tryDeleteIfExists()
    }

    override fun loadAccessToken(cacheKey: AccessTokenCacheKey): AccessToken? {
        LOG.debug { "loadAccessToken for $cacheKey" }
        val cacheFile = accessTokenCache(cacheKey)
        val inputStream = cacheFile.tryInputStreamIfExists() ?: return null

        val token = loadAccessToken(inputStream)

        return token
    }

    override fun saveAccessToken(cacheKey: AccessTokenCacheKey, accessToken: AccessToken) {
        LOG.debug { "saveAccessToken for $cacheKey" }
        val accessTokenCache = accessTokenCache(cacheKey)
        writeKey(accessTokenCache) {
            objectMapper.writeValue(it, accessToken)
        }
    }

    override fun invalidateAccessToken(cacheKey: AccessTokenCacheKey) {
        LOG.debug { "invalidateAccessToken for $cacheKey" }
        accessTokenCache(cacheKey).tryDeleteIfExists()
    }

    private fun clientRegistrationCache(ssoRegion: String): Path = cacheDir.resolve("aws-toolkit-jetbrains-client-id-$ssoRegion.json")

    private fun clientRegistrationCache(cacheKey: ClientRegistrationCacheKey): Path =
        cacheNameMapper.valueToTree<ObjectNode>(cacheKey).apply {
            // session is omitted to keep the key deterministic since we attach an epoch
            put("tool", "aws-toolkit-jetbrains")
        }.let {
            val sha = sha1(cacheNameMapper.writeValueAsString(it))

            cacheDir.resolve("$sha.json").also {
                LOG.debug { "$cacheKey resolves to $it" }
            }
        }

    private fun accessTokenCache(ssoUrl: String): Path {
        val fileName = "${sha1(ssoUrl)}.json"
        return cacheDir.resolve(fileName)
    }

    private fun accessTokenCache(cacheKey: AccessTokenCacheKey): Path {
        val fileName = "${sha1(cacheNameMapper.writeValueAsString(cacheKey))}.json"
        return cacheDir.resolve(fileName)
    }

    private fun loadClientRegistration(inputStream: InputStream) =
        tryOrNull {
            val clientRegistration = objectMapper.readValue<ClientRegistration>(inputStream)
            if (clientRegistration.expiresAt.isNotExpired()) {
                clientRegistration
            } else {
                null
            }
        }

    private fun loadAccessToken(inputStream: InputStream) = tryOrNull {
        val accessToken = objectMapper.readValue<AccessToken>(inputStream)
        // Use same expiration logic as client registration even though RFC/SEP does not specify it.
        // This prevents a cache entry being returned as valid and then expired when we go to use it.
        if (!accessToken.isDefinitelyExpired()) {
            accessToken
        } else {
            null
        }
    }

    private fun Path.tryDeleteIfExists(): Boolean = tryFileOp(LOG) { deleteIfExists() }

    private fun Path.tryInputStreamIfExists(): InputStream? = tryFileOp(LOG) { inputStreamIfExists() }

    private fun sha1(string: String): String {
        val digest = MessageDigest.getInstance("SHA-1")
        return digest.digest(string.toByteArray(Charsets.UTF_8)).toHexString()
    }

    private fun writeKey(path: Path, consumer: (OutputStream) -> Unit) {
        LOG.debug { "writing to $path" }
        path.tryDirOp(LOG) { createParentDirectories() }

        path.tryFileOp(LOG) {
            touch(restrictToOwner = true)
            outputStream().use(consumer)
        }
    }

    // If the item is going to expire in the next 15 mins, we must treat it as already expired
    private fun Instant.isNotExpired(): Boolean = this.isAfter(Instant.now(clock).plus(EXPIRATION_THRESHOLD))

    private fun AccessToken.isDefinitelyExpired(): Boolean = refreshToken == null && !expiresAt.isNotExpired()

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

    companion object {
        val EXPIRATION_THRESHOLD = Duration.ofMinutes(15)
        private val LOG = getLogger<DiskCache>()
    }
}
