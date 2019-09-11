// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package toolkits.gradle.changelog

import com.fasterxml.jackson.core.JsonGenerator
import com.fasterxml.jackson.databind.MapperFeature
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.SerializationFeature
import com.fasterxml.jackson.databind.SerializerProvider
import com.fasterxml.jackson.databind.annotation.JsonSerialize
import com.fasterxml.jackson.databind.ser.std.StdSerializer
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import java.io.File
import java.time.LocalDate

val MAPPER: ObjectMapper = jacksonObjectMapper().registerModule(JavaTimeModule()).enable(MapperFeature.ACCEPT_CASE_INSENSITIVE_ENUMS)
    .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)

inline fun <reified T : Any> readFile(f: File): T {
    try {
        return MAPPER.readValue(f)
    } catch (e: Exception) {
        throw RuntimeException("Exception reading ${T::class.java} from $f", e)
    }
}

@JsonSerialize(using = ChangeType.Serializer::class)
enum class ChangeType(val sectionTitle: String) {
    BREAKING("Breaking Change"),
    FEATURE("Feature"),
    BUGFIX("Bug Fix"),
    DEPRECATION("Deprecation"),
    REMOVAL("Removal");

    class Serializer : StdSerializer<ChangeType>(ChangeType::class.java) {
        override fun serialize(value: ChangeType, gen: JsonGenerator?, provider: SerializerProvider?) {
            gen?.writeString(value.name.toLowerCase())
        }
    }
}

data class Entry(val type: ChangeType, val description: String)
data class ReleaseEntry(val date: LocalDate, val version: String, val entries: List<Entry>)
